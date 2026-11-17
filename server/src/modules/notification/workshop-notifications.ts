import type { WorkshopEvent } from './notification.events';
import { drainJobcardNotifications, sendJobcardReminders } from './jobcard-notification-router';
export { workshopRecipients } from './workshop-notification-outbox';

/** Delivery is backed by the committed outbox; failures cannot lose business events. */
export async function notifyWorkshopEvent(event: WorkshopEvent, jobCardId: string, _occurrenceId: string) {
  if (event.startsWith('PROMISED_')) await sendJobcardReminders();
  await drainJobcardNotifications(jobCardId);
}
