import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { generateTallyImportXml, generateTallyVoucherXml, type LedgerEntry, type TallyDocumentType } from './tally-xml';

export { generateTallyImportXml, generateTallyVoucherXml } from './tally-xml';

export class TallyService {
  async importLedgers(ledgers: Array<{ code: string; name: string }>) {
    if (ledgers.length === 0) throw new BadRequestError('At least one Tally ledger is required');
    const normalized = ledgers.map((ledger) => ({ code: ledger.code.trim(), name: ledger.name.trim() }));
    if (normalized.some((ledger) => !ledger.code || !ledger.name)) throw new BadRequestError('Ledger code and name are required');
    if (new Set(normalized.map((ledger) => ledger.code)).size !== normalized.length) {
      throw new BadRequestError('Tally ledger codes must be unique in an import');
    }
    const existing = await prisma.tallyLedger.findMany({
      where: { code: { in: normalized.map((ledger) => ledger.code) } },
      select: { code: true },
    });
    const existingCodes = new Set(existing.map((ledger) => ledger.code));
    await prisma.$transaction(normalized.map((ledger) => prisma.tallyLedger.upsert({
      where: { code: ledger.code },
      create: { ...ledger, active: true },
      update: { name: ledger.name, active: true, importedAt: new Date() },
    })));
    const updated = normalized.filter((ledger) => existingCodes.has(ledger.code)).length;
    return { imported: normalized.length, added: normalized.length - updated, updated };
  }

  async listLedgers(search?: string) {
    return prisma.tallyLedger.findMany({
      where: { active: true, ...(search ? { OR: [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ] } : {}) },
      orderBy: [{ code: 'asc' }],
      take: 100,
    });
  }

  async setCustomerLedger(customerId: string, tallyLedgerCode: string | null) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundError('Customer not found');
    const ledger = tallyLedgerCode
      ? await prisma.tallyLedger.findFirst({ where: { code: tallyLedgerCode, active: true } })
      : null;
    if (tallyLedgerCode && !ledger) throw new NotFoundError('Active Tally ledger not found');
    return prisma.customer.update({
      where: { id: customerId },
      data: { tallyLedgerId: ledger?.id ?? null },
      include: { tallyLedger: true },
    });
  }

  async listAccountMappings() {
    return prisma.tallyAccountMapping.findMany({ orderBy: [{ documentType: 'asc' }, { accountType: 'asc' }] });
  }

  async saveAccountMappings(mappings: Array<{
    documentType: TallyDocumentType;
    accountType: string;
    tallyLedgerCode: string;
    tallyLedgerName: string;
  }>) {
    const ledgers = await prisma.tallyLedger.findMany({
      where: { code: { in: mappings.map((mapping) => mapping.tallyLedgerCode) }, active: true },
      select: { code: true, name: true },
    });
    const ledgerByCode = new Map(ledgers.map((ledger) => [ledger.code, ledger]));
    const canonicalMappings = mappings.map((mapping) => {
      const ledger = ledgerByCode.get(mapping.tallyLedgerCode);
      if (!ledger) throw new BadRequestError(`Active Tally ledger ${mapping.tallyLedgerCode} was not found`);
      return { ...mapping, tallyLedgerName: ledger.name };
    });
    await prisma.$transaction(canonicalMappings.map((mapping) => prisma.tallyAccountMapping.upsert({
      where: { documentType_accountType: { documentType: mapping.documentType, accountType: mapping.accountType } },
      create: mapping,
      update: { tallyLedgerCode: mapping.tallyLedgerCode, tallyLedgerName: mapping.tallyLedgerName },
    })));
    return this.listAccountMappings();
  }

  async listDocuments(input: { date: string; type: TallyDocumentType; branchId?: string }) {
    const start = new Date(`${input.date}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    if (input.type === 'JOB_BILL') {
      const invoices = await prisma.invoice.findMany({
        where: {
          issuedDate: { gte: start, lt: end },
          jobCardId: { not: null },
          status: { notIn: ['Cancelled', 'CANCELLED', 'VOID'] },
          tallyPostedAt: null,
          ...(input.branchId ? { jobCard: { branchId: input.branchId } } : {}),
        },
        include: { customer: { include: { tallyLedger: true } }, jobCard: true },
        orderBy: { invoiceNumber: 'asc' },
      });
      const logs = await prisma.tallyPostingLog.findMany({
        where: { documentType: 'JOB_BILL', status: { in: ['EXPORTED', 'POSTED'] }, documentId: { in: invoices.map((invoice) => invoice.id) } },
        select: { documentId: true },
      });
      const exportedIds = new Set(logs.map((log) => log.documentId));
      return invoices.filter((invoice) => !exportedIds.has(invoice.id)).map((invoice) => ({
        id: invoice.id,
        documentNumber: invoice.invoiceNumber,
        date: invoice.issuedDate,
        customerName: `${invoice.customer.firstName} ${invoice.customer.lastName}`,
        tallyLedger: invoice.customer.tallyLedger,
        ready: Boolean(invoice.customer.tallyLedger),
        reason: invoice.customer.tallyLedger ? undefined : 'Customer has no Tally ledger mapping',
        total: invoice.total,
      }));
    }

    const receipts = await prisma.receipt.findMany({
      where: {
        issuedAt: { gte: start, lt: end },
        status: 'ACTIVE',
        tallyPostedAt: null,
        ...(input.branchId ? { customer: { branchId: input.branchId } } : {}),
      },
      include: { customer: { include: { tallyLedger: true } }, bank: true },
      orderBy: { receiptNumber: 'asc' },
    });
    const logs = await prisma.tallyPostingLog.findMany({
      where: { documentType: 'RECEIPT', status: { in: ['EXPORTED', 'POSTED'] }, documentId: { in: receipts.map((receipt) => receipt.id) } },
      select: { documentId: true },
    });
    const exportedIds = new Set(logs.map((log) => log.documentId));
    return receipts.filter((receipt) => !exportedIds.has(receipt.id)).map((receipt) => ({
      id: receipt.id,
      documentNumber: receipt.receiptNumber,
      date: receipt.issuedAt,
      customerName: `${receipt.customer.firstName} ${receipt.customer.lastName}`,
      tallyLedger: receipt.customer.tallyLedger,
      ready: Boolean(receipt.customer.tallyLedger),
      reason: receipt.customer.tallyLedger ? undefined : 'Customer has no Tally ledger mapping',
      total: receipt.amount,
    }));
  }

  private async mappingsFor(type: TallyDocumentType, transaction: Prisma.TransactionClient) {
    const mappings = await transaction.tallyAccountMapping.findMany({ where: { documentType: type } });
    return new Map(mappings.map((mapping) => [mapping.accountType, mapping.tallyLedgerName]));
  }

  async exportBatch(input: {
    documents: Array<{ type: TallyDocumentType; id: string }>;
    postedById: string;
  }) {
    const batchId = randomUUID();
    const exported: Array<{ type: TallyDocumentType; id: string; documentNumber: string }> = [];
    const skipped: Array<{ type: TallyDocumentType; id: string; documentNumber?: string; reason: string }> = [];
    const vouchers: string[] = [];

    await prisma.$transaction(async (transaction) => {
      for (const selected of input.documents) {
        const existingLog = await transaction.tallyPostingLog.findUnique({
          where: { documentType_documentId: { documentType: selected.type, documentId: selected.id } },
        });
        if (existingLog && existingLog.status !== 'INVALIDATED') {
          skipped.push({ ...selected, reason: `Already exported in batch ${existingLog.batchId}` });
          continue;
        }
        const mappings = await this.mappingsFor(selected.type, transaction);
        let payload: string | undefined;
        let documentNumber: string | undefined;

        if (selected.type === 'JOB_BILL') {
          const invoice = await transaction.invoice.findUnique({
            where: { id: selected.id },
            include: { customer: { include: { tallyLedger: true } } },
          });
          if (!invoice || !invoice.jobCardId || !isValidInvoiceStatus(invoice.status)) {
            skipped.push({ ...selected, reason: 'Job bill is missing or cancelled' });
            continue;
          }
          documentNumber = invoice.invoiceNumber;
          if (!invoice.customer.tallyLedger?.active) {
            skipped.push({ ...selected, documentNumber, reason: 'Customer has no active Tally ledger mapping' });
            continue;
          }
          const values = [
            ['PARTS_SALES', -invoice.partsTotal],
            ['LABOUR_SALES', -invoice.labourTotal],
            ['PARTS_DISCOUNT', invoice.partsDiscountAmount],
            ['LABOUR_DISCOUNT', invoice.labourDiscountAmount],
            ['VAT', -invoice.vatAmount],
            ['ROUND_OFF', -invoice.roundOff],
          ] as const;
          const missingMapping = values.find(([key, amount]) => amount !== 0 && !mappings.has(key));
          if (missingMapping) {
            skipped.push({ ...selected, documentNumber, reason: `Missing Tally account mapping: ${missingMapping[0]}` });
            continue;
          }
          const entries: LedgerEntry[] = [
            { name: invoice.customer.tallyLedger.name, amount: invoice.total },
            ...values.filter(([, amount]) => amount !== 0).map(([key, amount]) => ({ name: mappings.get(key)!, amount })),
          ];
          payload = generateTallyVoucherXml({ type: selected.type, number: invoice.invoiceNumber, date: invoice.issuedDate, party: invoice.customer.tallyLedger.name, entries });
        } else {
          const receipt = await transaction.receipt.findUnique({
            where: { id: selected.id },
            include: { customer: { include: { tallyLedger: true } } },
          });
          if (!receipt || receipt.status !== 'ACTIVE') {
            skipped.push({ ...selected, reason: 'Receipt is missing or cancelled' });
            continue;
          }
          documentNumber = receipt.receiptNumber;
          if (!receipt.customer.tallyLedger?.active) {
            skipped.push({ ...selected, documentNumber, reason: 'Customer has no active Tally ledger mapping' });
            continue;
          }
          const cashOrBank = receipt.mode === 'CASH' ? 'CASH' : 'BANK';
          const accountName = mappings.get(cashOrBank);
          if (!accountName) {
            skipped.push({ ...selected, documentNumber, reason: `Missing Tally account mapping: ${cashOrBank}` });
            continue;
          }
          const entries: LedgerEntry[] = [
            { name: accountName, amount: receipt.amount },
            { name: receipt.customer.tallyLedger.name, amount: -receipt.amount },
          ];
          payload = generateTallyVoucherXml({ type: selected.type, number: receipt.receiptNumber, date: receipt.issuedAt, party: receipt.customer.tallyLedger.name, entries });
        }

        if (existingLog) {
          await transaction.tallyPostingLog.update({
            where: { id: existingLog.id },
            data: { status: 'EXPORTED', batchId, payload, voucherNumber: null, postedAt: null, postedById: null },
          });
        } else {
          await transaction.tallyPostingLog.create({
            data: { documentType: selected.type, documentId: selected.id, status: 'EXPORTED', batchId, payload },
          });
        }
        vouchers.push(payload!);
        exported.push({ type: selected.type, id: selected.id, documentNumber: documentNumber! });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { batchId, xml: generateTallyImportXml(vouchers), exported, skipped };
  }

  async confirmBatch(input: {
    batchId: string;
    postedById: string;
    documents: Array<{ type: TallyDocumentType; id: string; voucherNumber: string }>;
  }) {
    return prisma.$transaction(async (transaction) => {
      const confirmed: string[] = [];
      for (const document of input.documents) {
        const log = await transaction.tallyPostingLog.findUnique({
          where: { documentType_documentId: { documentType: document.type, documentId: document.id } },
        });
        if (!log || log.batchId !== input.batchId || log.status !== 'EXPORTED') {
          throw new ConflictError('The selected document was not exported in this batch or was already confirmed');
        }
        await transaction.tallyPostingLog.update({
          where: { id: log.id },
          data: { status: 'POSTED', voucherNumber: document.voucherNumber, postedAt: new Date(), postedById: input.postedById },
        });
        if (document.type === 'JOB_BILL') {
          const invoice = await transaction.invoice.findUnique({ where: { id: document.id }, select: { status: true } });
          if (!invoice || !isValidInvoiceStatus(invoice.status)) {
            throw new ConflictError('A cancelled or missing job bill cannot be confirmed as posted');
          }
          await transaction.invoice.update({
            where: { id: document.id },
            data: { tallyVoucherNo: document.voucherNumber, tallyPostedAt: new Date(), tallyPostedById: input.postedById },
          });
        } else {
          const receipt = await transaction.receipt.findUnique({ where: { id: document.id }, select: { status: true } });
          if (!receipt || receipt.status !== 'ACTIVE') {
            throw new ConflictError('A cancelled or missing receipt cannot be confirmed as posted');
          }
          await transaction.receipt.update({
            where: { id: document.id },
            data: { tallyVoucherNo: document.voucherNumber, tallyPostedAt: new Date(), tallyPostedById: input.postedById },
          });
        }
        confirmed.push(document.id);
      }
      return { confirmed: confirmed.length, documentIds: confirmed };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

function isValidInvoiceStatus(status: string) {
  return !['CANCELLED', 'CANCELED', 'VOID'].includes(status.toUpperCase());
}