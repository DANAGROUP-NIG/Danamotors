import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { z } from 'zod';

export const creditDaysSchema = z.number().int().min(0).max(3650);
export const lagosDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export function invoiceStatus(balance: number, total: number, dueDate?: Date | null, now = new Date()) {
  if (balance <= 0) return 'Paid';
  if (dueDate && lagosDay(dueDate) < lagosDay(now)) return 'Overdue';
  return balance < total ? 'Partially Paid' : 'Unpaid';
}
export function creditDueDate(issuedDate: Date, days: number) {
  creditDaysSchema.parse(days);
  const date = new Date(lagosDay(issuedDate) + 'T00:00:00+01:00');
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}
export async function defaultCreditDays(tx: Prisma.TransactionClient) {
  const setting = await tx.financeSetting.findUnique({ where: { key: 'defaultCreditDays' } });
  return creditDaysSchema.parse(setting?.value ?? 30);
}
/** Bounded, restart-safe daily sweep. Database lock prevents concurrent server instances. */
export async function refreshOverdueInvoices(now = new Date()) {
  let changed = 0;
  for (;;) {
    const count = await prisma.$transaction(async tx => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`SELECT pg_try_advisory_xact_lock(77005) AS locked`);
      if (!lock[0]?.locked) return 0;
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`SELECT id,status FROM "Invoice"
        WHERE "cancelledAt" IS NULL AND UPPER(status) IN ('UNPAID','PARTIALLY PAID')
          AND ROUND("outstandingAmount"::numeric,2)>0
          AND ("dueDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos')::date < ${lagosDay(now)}::date
        ORDER BY id LIMIT 500 FOR UPDATE SKIP LOCKED`);
      if (!rows.length) return 0;
      await tx.invoice.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { status: 'Overdue' } });
      await tx.auditLog.create({ data: { action: 'INVOICES_MARKED_OVERDUE', details: JSON.stringify({ asOn: lagosDay(now), invoices: rows }) } });
      return rows.length;
    }, { timeout: 15000 });
    changed += count;
    if (count < 500) return changed;
  }
}
export function startOverdueSweep() {
  let running = false;
  let lastDay = '';
  const tick = async () => {
    const day = lagosDay(new Date());
    if (running || lastDay === day) return;
    running = true;
    try { await refreshOverdueInvoices(); lastDay = day; }
    catch (error) { console.error('Overdue invoice sweep failed; will retry', error); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
