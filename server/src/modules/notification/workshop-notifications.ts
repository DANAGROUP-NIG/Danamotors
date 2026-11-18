import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
import { holdsPermission } from '../../shared/effectivePermissions';
import { NotificationService } from './notification.service';
import type { WorkshopEvent } from './notification.events';
import { drainJobcardNotifications, sendJobcardReminders } from './jobcard-notification-router';
export { workshopRecipients } from './workshop-notification-outbox';

/** Delivery is backed by the committed outbox; failures cannot lose business events. */
export async function notifyWorkshopEvent(event: WorkshopEvent, jobCardId: string, _occurrenceId: string) {
  if (event.startsWith('PROMISED_')) await sendJobcardReminders();
  await drainJobcardNotifications(jobCardId);
}
