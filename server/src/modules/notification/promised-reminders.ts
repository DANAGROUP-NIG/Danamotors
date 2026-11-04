import prisma from '../../prisma/client';
import { notifyWorkshopEvent } from './workshop-notifications';
export function reminderWindow(now: Date, hours: 12 | 24) {
  return { gt: new Date(now.getTime() + (hours - 1) * 3600000), lte: new Date(now.getTime() + hours * 3600000) };
}
export async function sendPromisedReminders(now = new Date()) {
  if (process.env.JOB_PROMISED_REMINDERS_ENABLED !== 'true') return;
  for (const hours of [24, 12] as const) {
    const cards = await prisma.jobCard.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'QC', 'Open', 'Pending', 'In Progress', 'On Hold', 'Quality Check'] }, promisedAt: reminderWindow(now, hours), billedAt: null }, select: { id: true, promisedAt: true } });
    for (const card of cards) await notifyWorkshopEvent(hours === 24 ? 'PROMISED_24H' : 'PROMISED_12H', card.id, card.promisedAt!.toISOString());
  }
}
export function startPromisedReminders() {
  if (process.env.JOB_PROMISED_REMINDERS_ENABLED !== 'true') return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await sendPromisedReminders(); }
    catch { process.emitWarning('Promised-date reminder sweep failed; will retry', { code: 'PROMISED_REMINDER_FAILED' }); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, 5 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
