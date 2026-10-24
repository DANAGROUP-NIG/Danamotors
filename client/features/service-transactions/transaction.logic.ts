import type { LabourDraft } from './document.types';
export function lagosDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' });
}
export function lagosInput(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}
export function lagosIso(value: string) { return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+01:00`).toISOString(); }
export function canWriteTransactions(job: { status: string; billedAt?: string | null; invoices?: { status: string }[] }) {
  return !job.billedAt && !['BILLED', 'DELIVERED', 'CANCELLED', 'CANCELED', 'CLOSED'].includes(job.status.toUpperCase()) && !(job.invoices ?? []).some(bill => !['CANCELLED', 'CANCELED', 'VOID'].includes(bill.status.toUpperCase()));
}
export function remainingReturn(line: { quantityIssued?: number; returns?: { quantity: number; status: string }[] }) { return Math.max(0, (line.quantityIssued ?? 0) - (line.returns ?? []).filter(row => !['CANCELLED', 'REJECTED'].includes(row.status.toUpperCase())).reduce((total, row) => total + row.quantity, 0)); }
export const moneyText = (value: string | number | null | undefined, currency = 'NGN') => new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(Number(value ?? 0));
export function canEditBooking(booking: { bookingStatus?: string; status: string; jobCards?: unknown[] }) { return (booking.bookingStatus ?? 'BOOKED') === 'BOOKED' && !['Completed', 'Closed', 'Cancelled', 'No Show'].includes(booking.status) && !booking.jobCards?.length; }
export function labourBody(row: LabourDraft) { return { ...row, technicianId: row.technicianId || undefined, mechanicId: row.mechanicId || undefined, groupId: row.groupId || undefined, campaignId: row.chargeType === 'FREE' ? row.campaignId : undefined, reason: row.chargeType === 'GOODWILL' ? row.reason?.trim() : undefined }; }
