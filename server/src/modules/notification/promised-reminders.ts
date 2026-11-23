import { drainJobcardNotifications, sendJobcardReminders, startJobcardNotifications } from './jobcard-notification-router';
export function reminderWindow(now: Date, hours: 12 | 24) {
  return { gt: new Date(now.getTime() + (hours - 1) * 3600000), lte: new Date(now.getTime() + hours * 3600000) };
}
export async function sendPromisedReminders(now = new Date()) {
  await sendJobcardReminders(now);
  await drainJobcardNotifications();
}
export function startPromisedReminders() {
  return startJobcardNotifications();
}
