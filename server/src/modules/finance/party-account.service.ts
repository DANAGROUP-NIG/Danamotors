import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { money, sumMoney } from './money';
import { nextDocumentNumber } from './document-number';
import { fifoAdjustments, pairAdjustments, validateAdjustmentSelections, type PartyDocument, type AdjustmentSelection } from './party-adjustment';
import { createAdjustmentSchema, openingBalanceSchema, type CreateAdjustmentInput, type OpeningBalanceInput } from './party-account.validation';

export async function withPartyTransaction<T>(work: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt + Math.floor(Math.random() * 100)));
        continue;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2028','P2024','P2034'].includes(error.code)) {
        throw new AppError('The database is busy. Refresh balances and check whether the operation completed before retrying. For creation, reuse the same request key and details.', 503);
      }
      throw error;
    }
  }
}

export async function lockParty(transaction: Prisma.TransactionClient, customerId: string) {
  await transaction.$queryRaw(Prisma.sql`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`);
  const customer = await transaction.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.mergedIntoId) throw new NotFoundError('Customer not found');
  return customer;
}

export async function availablePartyCredit(transaction: Prisma.TransactionClient, customerId: string, branchId?: string) {
  const totals = await transaction.$queryRaw<Array<{ amount: Prisma.Decimal }>>(Prisma.sql`SELECT (
    COALESCE((SELECT SUM(ROUND(r."advanceAmount"::numeric,2)) FROM "Receipt" r WHERE r."customerId" = ${customerId} AND r.status = 'ACTIVE' ${branchClause('r',branchId)}),0) +
    COALESCE((SELECT SUM(n."remainingAmount") FROM "PartyNote" n WHERE n."customerId" = ${customerId} AND n.direction = 'CREDIT' AND n.status = 'ACTIVE' ${branchClause('n',branchId)}),0)
  ) AS amount`);
  return money(Number(totals[0].amount));
}

const hashRequest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const branchClause = (alias: string, branchId?: string) => branchId ? Prisma.sql`AND ${Prisma.raw(alias)}."branchId" = ${branchId}` : Prisma.empty;

function documentQuery(customerId: string, branchId: string | undefined, side: 'DEBIT' | 'CREDIT') {
  const notes = Prisma.sql`SELECT n.id, 'NOTE'::text AS kind, n.number, n.date, n.amount::double precision AS amount,
    n."remainingAmount"::double precision AS balance FROM "PartyNote" n
    WHERE n."customerId" = ${customerId} AND n.direction = ${side} AND n.status = 'ACTIVE' ${branchClause('n', branchId)}`;
  if (side === 'CREDIT') return Prisma.sql`SELECT r.id, 'RECEIPT'::text AS kind, r."receiptNumber" AS number, r."issuedAt" AS date,
    r.amount, r."advanceAmount" AS balance FROM "Receipt" r WHERE r."customerId" = ${customerId} AND r.status = 'ACTIVE' ${branchClause('r', branchId)} UNION ALL ${notes}`;
  return Prisma.sql`SELECT i.id, 'INVOICE'::text AS kind, i."invoiceNumber" AS number, i."issuedDate" AS date,
    i.total AS amount, i."outstandingAmount" AS balance FROM "Invoice" i LEFT JOIN "JobCard" j ON j.id=i."jobCardId"
    JOIN "Customer" c ON c.id=i."customerId" WHERE i."customerId" = ${customerId}
    AND UPPER(i.status) NOT IN ('CANCELLED','CANCELED','VOID')
    ${branchId ? Prisma.sql`AND COALESCE(j."branchId",c."branchId") = ${branchId}` : Prisma.empty} UNION ALL ${notes}`;
}

async function selectedDocuments(transaction: Prisma.TransactionClient, customerId: string, branchId: string | undefined, side: 'DEBIT' | 'CREDIT', selections: AdjustmentSelection[]) {
  const keys = selections.map(line => Prisma.sql`(${line.kind},${line.id})`);
  const query = documentQuery(customerId, branchId, side);
  return transaction.$queryRaw<PartyDocument[]>(Prisma.sql`SELECT * FROM (${query}) d WHERE (d.kind,d.id) IN (${Prisma.join(keys)})`);
}

async function lockSelectedDocuments(transaction: Prisma.TransactionClient, selections: AdjustmentSelection[]) {
  const idsFor = (kind: PartyDocument['kind']) => [...new Set(selections.filter(line => line.kind === kind).map(line => line.id))].sort();
  const receipts = idsFor('RECEIPT');
  const invoices = idsFor('INVOICE');
  const notes = idsFor('NOTE');
  if (receipts.length) await transaction.$queryRaw(Prisma.sql`SELECT id FROM "Receipt" WHERE id IN (${Prisma.join(receipts)}) ORDER BY id FOR UPDATE`);
  if (invoices.length) await transaction.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE id IN (${Prisma.join(invoices)}) ORDER BY id FOR UPDATE`);
  if (notes.length) await transaction.$queryRaw(Prisma.sql`SELECT id FROM "PartyNote" WHERE id IN (${Prisma.join(notes)}) ORDER BY id FOR UPDATE`);
}

async function changeBalance(transaction: Prisma.TransactionClient, selection: AdjustmentSelection, documents: PartyDocument[], reverse = false) {
  const document = documents.find(line => line.id === selection.id && line.kind === selection.kind)!;
  const balance = sumMoney([document.balance, reverse ? selection.amount : -selection.amount]);
  if (balance < 0 || balance > money(document.amount)) throw new ConflictError('The document balance cannot support this adjustment');
  if (selection.kind === 'INVOICE') {
    await transaction.invoice.update({ where: { id: selection.id }, data: { outstandingAmount: balance, status: balance <= 0 ? 'Paid' : balance < document.amount ? 'Partially Paid' : 'Unpaid' } });
  } else if (selection.kind === 'RECEIPT') {
    await transaction.receipt.update({ where: { id: selection.id }, data: { advanceAmount: balance } });
  } else {
    await transaction.partyNote.update({ where: { id: selection.id }, data: { remainingAmount: new Prisma.Decimal(balance) } });
  }
}

export class PartyAccountService {
  async search(branchId: string | undefined, search: string, order: "name" | "code", limit: number) {
    const term = "%" + search.replace(/[\\%_]/g, character => "\\" + character) + "%";
    return prisma.$queryRaw<Array<{ id: string; code: string; name: string }>>(Prisma.sql`SELECT id, code, COALESCE(NULLIF("companyName",''), "firstName" || ' ' || "lastName") AS name FROM "Customer"
      WHERE "mergedIntoId" IS NULL AND UPPER(type) <> 'VENDOR' ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
      AND (code ILIKE ${term} OR "companyName" ILIKE ${term} OR "firstName" ILIKE ${term} OR "lastName" ILIKE ${term})
      ORDER BY ${order === "code" ? Prisma.sql`code, name, id` : Prisma.sql`name, code, id`} LIMIT ${limit}`);
  }
  async account(customerId: string, branchId?: string) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.mergedIntoId) throw new NotFoundError('Customer not found');
    const debitQuery = documentQuery(customerId, branchId, 'DEBIT');
    const creditQuery = documentQuery(customerId, branchId, 'CREDIT');
    const totals = await prisma.$queryRaw<Array<{ outstanding: Prisma.Decimal; availableCredit: Prisma.Decimal }>>(Prisma.sql`SELECT
      (SELECT COALESCE(SUM(ROUND(balance::numeric,2)),0) FROM (${debitQuery}) debits) AS outstanding,
      (SELECT COALESCE(SUM(ROUND(balance::numeric,2)),0) FROM (${creditQuery}) credits) AS "availableCredit"`);
    const outstanding = money(Number(totals[0].outstanding));
    const availableCredit = money(Number(totals[0].availableCredit));
    return { customer: { id: customer.id, code: customer.code, name: customer.companyName || customer.firstName + ' ' + customer.lastName, partyStatus: customer.partyStatus }, outstanding, availableCredit, netOutstanding: sumMoney([outstanding, -availableCredit]) };
  }

  async documents(customerId: string, options: { branchId?: string; side: 'DEBIT' | 'CREDIT'; openOnly: boolean; page: number; pageSize: number }) {
    const query = documentQuery(customerId, options.branchId, options.side);
    const filter = options.openOnly ? Prisma.sql`WHERE balance > 0` : Prisma.empty;
    const [documents, count] = await Promise.all([
      prisma.$queryRaw<PartyDocument[]>(Prisma.sql`SELECT * FROM (${query}) d ${filter} ORDER BY date, number, id LIMIT ${options.pageSize} OFFSET ${(options.page-1)*options.pageSize}`),
      prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT COUNT(*)::int AS count FROM (${query}) d ${filter}`),
    ]);
    return { documents, meta: { page: options.page, pageSize: options.pageSize, total: count[0].count, totalPages: Math.ceil(count[0].count/options.pageSize) } };
  }

  async fundingCredits(transaction: Prisma.TransactionClient, customerId: string, branchId: string, date: Date) {
    return transaction.$queryRaw<PartyDocument[]>(Prisma.sql`SELECT * FROM (${documentQuery(customerId,branchId,'CREDIT')}) d WHERE balance > 0 AND date <= ${date} ORDER BY date,number,id LIMIT 200`);
  }

  async fifo(customerId: string, branchId: string, date: Date) {
    const read = (side: 'DEBIT' | 'CREDIT') => prisma.$queryRaw<PartyDocument[]>(Prisma.sql`SELECT * FROM (${documentQuery(customerId, branchId, side)}) d WHERE balance > 0 AND date <= ${date} ORDER BY date,number,id LIMIT 200`);
    const [debitDocuments, creditDocuments] = await Promise.all([read('DEBIT'), read('CREDIT')]);
    return { ...fifoAdjustments(debitDocuments, creditDocuments), debitDocuments, creditDocuments, limit: 200 };
  }

  async createAdjustment(input: CreateAdjustmentInput, actorId: string) {
    const body = createAdjustmentSchema.parse({ body: input }).body;
    return withPartyTransaction(transaction => this.applyAdjustment(transaction, body, actorId));
  }

  async applyAdjustment(transaction: Prisma.TransactionClient, input: Omit<CreateAdjustmentInput, 'source'> & { source: 'ADVANCE_ADJUSTMENT' | 'FIFO' | 'CREDIT_APPLICATION' }, actorId?: string) {
    const normalized = { ...input, actorId, debits: [...input.debits].sort((a,b) => a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id)), credits: [...input.credits].sort((a,b) => a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id)) };
    const requestHash = hashRequest(normalized);
    await transaction.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey},0))`);
    const existing = await transaction.partyAdjustmentBatch.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ConflictError('This adjustment request was already used with different details');
      return existing;
    }
    const date = new Date(input.date);
    if (date.getTime() > Date.now()) throw new BadRequestError('Adjustment date cannot be in the future');
    const customer = await lockParty(transaction, input.customerId);
    if (customer.type?.toUpperCase() === 'VENDOR') throw new BadRequestError('Vendor party adjustments are not enabled');
    if (!await transaction.branch.findFirst({ where: { id: input.branchId, isActive: true } })) throw new BadRequestError('Select an active branch');
    await lockSelectedDocuments(transaction, [...input.debits,...input.credits]);
    const [debits, credits] = await Promise.all([
      selectedDocuments(transaction,input.customerId,input.branchId,'DEBIT',input.debits),
      selectedDocuments(transaction,input.customerId,input.branchId,'CREDIT',input.credits),
    ]);
    validateAdjustmentSelections(input.debits,debits);
    validateAdjustmentSelections(input.credits,credits);
    if ([...debits,...credits].some(document => document.date > date)) throw new BadRequestError('Adjustment date cannot precede a selected document');
    const pairs = pairAdjustments(input.debits,input.credits);
    const batch = await transaction.partyAdjustmentBatch.create({ data: { customerId: input.customerId, branchId: input.branchId, date, source: input.source, amount: new Prisma.Decimal(sumMoney(input.debits.map(line => line.amount))), actorId, idempotencyKey: input.idempotencyKey, requestHash } });
    await transaction.receiptAllocation.createMany({ data: pairs.map(pair => ({
      batchId: batch.id, amount: pair.amount, adjustedAt: date,
      invoiceId: pair.debit.kind === 'INVOICE' ? pair.debit.id : undefined,
      debitNoteId: pair.debit.kind === 'NOTE' ? pair.debit.id : undefined,
      receiptId: pair.credit.kind === 'RECEIPT' ? pair.credit.id : undefined,
      creditNoteId: pair.credit.kind === 'NOTE' ? pair.credit.id : undefined,
    })) });
    for (const debit of input.debits) await changeBalance(transaction,debit,debits);
    for (const credit of input.credits) await changeBalance(transaction,credit,credits);
    await transaction.auditLog.create({ data: { userId: actorId, action: 'PARTY_ADJUSTMENT_CREATED', details: JSON.stringify({ batchId: batch.id, customerId: input.customerId, source: input.source, debits: input.debits, credits: input.credits, amount: batch.amount.toString() }) } });
    return batch;
  }

  async openingBalance(input: OpeningBalanceInput, actorId: string) {
    const body = openingBalanceSchema.parse({ body: input }).body;
    const requestHash = hashRequest({ ...body, actorId });
    return withPartyTransaction(async transaction => {
      await transaction.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${body.idempotencyKey},0))`);
      const existing = await transaction.partyNote.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ConflictError('This opening request was already used with different details');
        return existing;
      }
      const customer = await lockParty(transaction,body.customerId);
      if (customer.type?.toUpperCase() === 'VENDOR') throw new BadRequestError('Vendor party adjustments are not enabled');
      if (customer.branchId !== body.branchId) throw new BadRequestError('Opening balances belong to the customer branch');
      const date = new Date(body.date);
      if (date.getTime() > Date.now()) throw new BadRequestError('Opening date cannot be in the future');
      if (!await transaction.branch.findFirst({ where: { id: body.branchId, isActive: true } })) throw new BadRequestError('Select an active branch');
      const number = await nextDocumentNumber(transaction,body.direction === 'DEBIT' ? 'DEBIT_NOTE' : 'CREDIT_NOTE',date);
      const note = await transaction.partyNote.create({ data: { ...body, date, number, type: 'OPENING', remainingAmount: new Prisma.Decimal(body.amount), tallyExcluded: true, createdById: actorId, requestHash } });
      await transaction.auditLog.create({ data: { userId: actorId, action: 'PARTY_OPENING_CREATED', details: JSON.stringify({ noteId: note.id, customerId: body.customerId, direction: body.direction, date: body.date, amount: body.amount, narration: body.narration }) } });
      return note;
    });
  }

  async batches(customerId: string, branchId?: string) {
    const batches = await prisma.partyAdjustmentBatch.findMany({ where: { customerId, ...(branchId ? { branchId } : {}) }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 20 });
    return batches.map(batch => ({ ...batch, amount: Number(batch.amount) }));
  }

  async reverse(id: string, remark: string, actorId: string) {
    if (!remark.trim()) throw new BadRequestError('A reversal remark is required');
    return withPartyTransaction(async transaction => {
      const initial = await transaction.partyAdjustmentBatch.findUnique({ where: { id } });
      if (!initial) throw new NotFoundError('Adjustment batch not found');
      await lockParty(transaction,initial.customerId);
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM "PartyAdjustmentBatch" WHERE id = ${id} FOR UPDATE`);
      const batch = await transaction.partyAdjustmentBatch.findUnique({ where: { id }, include: { allocations: true } });
      if (!batch) throw new NotFoundError('Adjustment batch not found');
      if (batch.reversedAt) throw new ConflictError('This adjustment batch has already been reversed');
      if (batch.tallyPostedAt) throw new BadRequestError('Posted batches cannot be reversed');
      const group = (side: 'DEBIT' | 'CREDIT') => {
        const selections = new Map<string,AdjustmentSelection>();
        for (const row of batch.allocations) {
          const kind = side === 'DEBIT' ? (row.invoiceId ? 'INVOICE' : 'NOTE') : (row.receiptId ? 'RECEIPT' : 'NOTE');
          const documentId = side === 'DEBIT' ? row.invoiceId ?? row.debitNoteId : row.receiptId ?? row.creditNoteId;
          if (!documentId) throw new ConflictError('Adjustment document is missing');
          const key = kind+':'+documentId;
          selections.set(key,{ id: documentId, kind, amount: sumMoney([selections.get(key)?.amount ?? 0,row.amount]) });
        }
        return [...selections.values()];
      };
      const debits = group('DEBIT');
      const credits = group('CREDIT');
      await lockSelectedDocuments(transaction,[...debits,...credits]);
      const invoiceIds = debits.filter(line=>line.kind==='INVOICE').map(line=>line.id);
      const receiptIds = credits.filter(line=>line.kind==='RECEIPT').map(line=>line.id);
      const noteIds = [...debits,...credits].filter(line=>line.kind==='NOTE').map(line=>line.id);
      const [postedInvoices,postedReceipts,postedNotes,posting] = await Promise.all([
        transaction.invoice.count({ where: { id: { in: invoiceIds }, tallyPostedAt: { not: null } } }),
        transaction.receipt.count({ where: { id: { in: receiptIds }, tallyPostedAt: { not: null } } }),
        transaction.partyNote.count({ where: { id: { in: noteIds }, tallyPostedAt: { not: null } } }),
        transaction.tallyPostingLog.findFirst({ where: { status: { in: ['EXPORTED','POSTED'] }, OR: [{ documentType: 'JOB_BILL', documentId: { in: invoiceIds } }, { documentType: 'RECEIPT', documentId: { in: receiptIds } }, { documentType: { in: ['DEBIT_NOTE','CREDIT_NOTE'] }, documentId: { in: noteIds } }] } }),
      ]);
      if (postedInvoices || postedReceipts || postedNotes || posting) throw new BadRequestError('A document exported or posted to Tally prevents reversal');
      // Admin-only reversal follows the original document IDs after a customer merge; document branch snapshots remain unchanged.
      const [debitDocuments,creditDocuments] = await Promise.all([
        selectedDocuments(transaction,batch.customerId,undefined,'DEBIT',debits),selectedDocuments(transaction,batch.customerId,undefined,'CREDIT',credits),
      ]);
      if (debitDocuments.length !== debits.length || creditDocuments.length !== credits.length) throw new ConflictError('A batch document is no longer active');
      for (const debit of debits) await changeBalance(transaction,debit,debitDocuments,true);
      for (const credit of credits) await changeBalance(transaction,credit,creditDocuments,true);
      const reversedAt = new Date();
      await transaction.receiptAllocation.updateMany({ where: { batchId: id }, data: { reversedAt } });
      if (batch.legacyPaymentId) await transaction.payment.deleteMany({ where: { id: batch.legacyPaymentId, method: 'Credit' } });
      await transaction.auditLog.create({ data: { userId: actorId, action: 'PARTY_ADJUSTMENT_REVERSED', details: JSON.stringify({ batchId: id, customerId: batch.customerId, amount: batch.amount.toString(), remark, legacyPaymentId: batch.legacyPaymentId }) } });
      return transaction.partyAdjustmentBatch.update({ where: { id }, data: { reversedAt, reversedById: actorId, reverseRemark: remark } });
    });
  }
}
