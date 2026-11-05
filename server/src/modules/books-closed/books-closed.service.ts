import { z } from 'zod';
import prisma from '../../prisma/client';
import { BadRequestError, NotFoundError } from '../../shared/errors/appError';
import { lagosDay } from '../finance/credit-terms';

/**
 * Books closed date (legacy Year End's FinancialYearFreezed). The company-wide date is FinanceSetting
 * 'booksClosedUpTo' ({ date }); a branch may also have a later date (BranchSettings.booksClosedUpTo).
 * Database triggers (migration 20261105160000_books_closed) refuse every finance and stock write dated on or
 * before a branch's date; this module only sets the dates. The financial year is January–December.
 *
 * Moving a date later closes more; moving it earlier or clearing it reopens, which needs a reason. Both are
 * audit events (BOOKS_CLOSED, BOOKS_REOPENED), and the dates themselves are in the change log.
 */

export const BOOKS_CLOSED_KEY = 'booksClosedUpTo';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2025-12-31').refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'Not a valid date');
export const setBooksClosedSchema = z.object({
  /** The last day that is closed, or null to reopen everything. */
  closedUpTo: isoDate.nullable(),
  /** Required to reopen (move the date earlier or clear it). */
  reason: z.string().trim().max(500).optional(),
}).strict();
export type SetBooksClosed = z.infer<typeof setBooksClosedSchema>;

type Actor = { userId: string };
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

async function companyDate(db: Pick<typeof prisma, 'financeSetting'> = prisma): Promise<string | null> {
  const row = await db.financeSetting.findUnique({ where: { key: BOOKS_CLOSED_KEY } });
  const value = row?.value as { date?: string | null } | null | undefined;
  return value?.date ?? null;
}

/** The company date, and each branch's own date and the date that applies to it. */
export async function getBooksClosed() {
  const [company, branches] = await Promise.all([
    companyDate(),
    prisma.branch.findMany({
      select: { id: true, code: true, name: true, isActive: true, settings: { select: { booksClosedUpTo: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);
  return {
    closedUpTo: company,
    today: lagosDay(new Date()),
    branches: branches.map((b) => {
      const own = day(b.settings?.booksClosedUpTo);
      return { branchId: b.id, code: b.code, name: b.name, isActive: b.isActive, closedUpTo: own, effective: later(company, own) };
    }),
  };
}

/** Checks a new date: not today or later, and a reason when it reopens. Returns whether it reopens. */
function checkChange(current: string | null, next: string | null, reason: string | undefined): boolean {
  if (next && next >= lagosDay(new Date()))
    throw new BadRequestError('Only past days can be closed: choose a date before today');
  const reopens = current !== null && (next === null || next < current);
  if (reopens && (!reason || reason.length < 5))
    throw new BadRequestError('Give a reason (at least 5 characters) to reopen closed books');
  return reopens;
}

/** Sets the company-wide date. */
export async function setCompanyBooksClosed(actor: Actor, input: SetBooksClosed) {
  const current = await companyDate();
  if (current === input.closedUpTo) return getBooksClosed();
  const reopens = checkChange(current, input.closedUpTo, input.reason);
  await prisma.$transaction(async (tx) => {
    await tx.financeSetting.upsert({
      where: { key: BOOKS_CLOSED_KEY },
      create: { key: BOOKS_CLOSED_KEY, value: { date: input.closedUpTo } },
      update: { value: { date: input.closedUpTo } },
    });
    await tx.auditLog.create({
      data: {
        userId: actor.userId,
        action: reopens ? 'BOOKS_REOPENED' : 'BOOKS_CLOSED',
        details: JSON.stringify({ scope: 'COMPANY', from: current, to: input.closedUpTo, ...(reopens && { reason: input.reason }) }),
      },
    });
  });
  return getBooksClosed();
}

/** Sets one branch's own, later date (null clears it, so the company date applies). */
export async function setBranchBooksClosed(actor: Actor, branchId: string, input: SetBooksClosed) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true, settings: { select: { booksClosedUpTo: true } } } });
  if (!branch) throw new NotFoundError('Branch not found');
  const company = await companyDate();
  const current = day(branch.settings?.booksClosedUpTo);
  if (current === input.closedUpTo) return getBooksClosed();
  if (input.closedUpTo && company && input.closedUpTo <= company)
    throw new BadRequestError(`The company books are already closed up to ${company}; a branch date must be later`);
  const reopens = checkChange(current, input.closedUpTo, input.reason);
  const value = input.closedUpTo ? new Date(`${input.closedUpTo}T00:00:00Z`) : null;
  await prisma.$transaction(async (tx) => {
    await tx.branchSettings.upsert({
      where: { branchId },
      create: { branchId, booksClosedUpTo: value },
      update: { booksClosedUpTo: value },
    });
    await tx.auditLog.create({
      data: {
        userId: actor.userId,
        action: reopens ? 'BOOKS_REOPENED' : 'BOOKS_CLOSED',
        details: JSON.stringify({ scope: 'BRANCH', branchId, branch: branch.name, from: current, to: input.closedUpTo, ...(reopens && { reason: input.reason }) }),
      },
    });
  });
  return getBooksClosed();
}

/**
 * Before closing: documents dated on or before the date that are still open. Closing does not stop them
 * from being completed (an STN can still be received, an MIT received), but they can no longer be
 * cancelled or edited, so finance may want to finish them first.
 */
export async function closingCheck(date: string, branchId?: string) {
  const end = new Date(`${date}T23:59:59.999+01:00`);
  const branch = (field: string) => (branchId ? { [field]: branchId } : {});
  const [stns, mits, stockTakes, invoices, receipts] = await Promise.all([
    prisma.stockTransferNote.count({ where: { documentDate: { lte: end }, status: { in: ['CREATED', 'DISPATCHED', 'PARTIALLY_RECEIVED'] }, ...branch('sourceBranchId') } }),
    prisma.materialInTransit.count({ where: { transitDate: { lte: end }, status: { in: ['IN_TRANSIT', 'VERIFIED', 'PARTIALLY_RECEIVED'] }, ...branch('destinationBranchId') } }),
    prisma.stockTake.count({ where: { createdAt: { lte: end }, status: 'ACTIVE', ...branch('branchId') } }),
    prisma.invoice.count({ where: { issuedDate: { lte: end }, cancelledAt: null, tallyPostedAt: null, ...(branchId ? { OR: [{ reportBranchId: branchId }, { jobCard: { branchId } }] } : {}) } }),
    prisma.receipt.count({ where: { issuedAt: { lte: end }, cancelledAt: null, tallyPostedAt: null, ...branch('branchId') } }),
  ]);
  return {
    date,
    open: [
      { key: 'stn', label: 'stock transfer notes not yet fully received', count: stns },
      { key: 'mit', label: 'Mobis invoices (MIT) not yet fully received', count: mits },
      { key: 'stockTake', label: 'stock takes still in progress', count: stockTakes },
      { key: 'invoice', label: 'bills not posted to Tally', count: invoices },
      { key: 'receipt', label: 'receipts not posted to Tally', count: receipts },
    ],
  };
}
