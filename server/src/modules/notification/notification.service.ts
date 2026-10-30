import { EVENT_CHANNELS, workshopNotification, type WorkshopEvent, type WorkshopNotificationPayload } from './notification.events';
import prisma from '../../prisma/client';
import { NotificationRepository, CreateNotificationData } from './notification.repository';
import { NotFoundError } from '../../shared/errors/appError';

export const NOTIFICATION_TYPES = {
  // Existing
  INVOICE_PAID:        'INVOICE_PAID',
  ESTIMATE_CREATED:    'ESTIMATE_CREATED',
  APPOINTMENT_BOOKED:  'APPOINTMENT_BOOKED',
  // Appointment lifecycle
  APPOINTMENT_CREATE:        'APPOINTMENT_CREATE',
  APPOINTMENT_APPROVED:      'APPOINTMENT_APPROVED',
  APPOINTMENT_REJECTED:      'APPOINTMENT_REJECTED',
  APPOINTMENT_STATUS_CHANGE: 'APPOINTMENT_STATUS_CHANGE',
  APPOINTMENT_CHECKED_IN:    'APPOINTMENT_CHECKED_IN',
  APPOINTMENT_CANCELLED:     'APPOINTMENT_CANCELLED',
  APPOINTMENT_COMPLETED:     'APPOINTMENT_COMPLETED',
  APPOINTMENT_RESCHEDULED:   'APPOINTMENT_RESCHEDULED',
  // Warranty & campaigns
  WARRANTY_JOB_CREATED:        'WARRANTY_JOB_CREATED',
  WARRANTY_CASE_STATUS:        'WARRANTY_CASE_STATUS',
  CAMPAIGN_VEHICLE_CHECKED_IN: 'CAMPAIGN_VEHICLE_CHECKED_IN',
  CAMPAIGN_ACTIVATED:          'CAMPAIGN_ACTIVATED',
} as const;

export interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  link?: string | null;
  branchId?: string | null;
}

export class NotificationService {
  private notificationRepository: NotificationRepository;

  constructor() {
    this.notificationRepository = new NotificationRepository();
  }

  async notify(event: WorkshopEvent, recipients: { userIds: string[]; customerIds?: string[] }, payload: WorkshopNotificationPayload) {
    if (!EVENT_CHANNELS[event]?.includes('in-app')) return;
    const notification = workshopNotification(event, payload);
    const rows = [
      ...[...new Set(recipients.userIds.filter(Boolean))].map(userId => ({ ...notification, userId })),
      ...[...new Set(recipients.customerIds ?? [])].map(customerId => ({ ...notification, customerId, link: `/portal/job-cards/${payload.jobCardId}` })),
    ];
    if (!rows.length) return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { await this.notificationRepository.createMany(rows); return; }
      catch { if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1))); }
    }
    process.emitWarning('Workshop notification persistence failed after retries', { code: 'NOTIFICATION_WRITE_FAILED' });
  }
  async listCustomer(customerId: string, page: number, limit: number) {
    const result = await this.notificationRepository.listByCustomer(customerId, (page - 1) * limit, limit);
    return { notifications: result.notifications, unread: result.unread, meta: { total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) } };
  }
  async markCustomerRead(id: string, customerId: string) {
    await this.notificationRepository.markCustomerRead(id, customerId);
  }
  async create(inputs: CreateNotificationData[]) {
    const validInputs = inputs.filter((input) => input.userId || input.customerId);
    if (validInputs.length === 0) return;
    try {
      await this.notificationRepository.createMany(validInputs);
    } catch (error) {
      console.error('NotificationService.create failed:', error);
    }
  }

  async notifyUsers(userIds: string[], payload: NotificationPayload) {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueIds.length === 0) return;
    await this.create(
      uniqueIds.map((userId) => ({ userId, ...payload })),
    );
  }

  async notifyRole(roleName: string, branchId: string | undefined, payload: NotificationPayload) {
    const users = await prisma.user.findMany({
      where: {
        role: { name: roleName },
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
      select: { id: true },
    });
    await this.notifyUsers(
      users.map((user) => user.id),
      { ...payload, branchId: payload.branchId ?? branchId ?? null },
    );
  }

  async list(params: {
    userId: string;
    page: number;
    limit: number;
    unreadOnly?: boolean;
    branchId?: string | null;
  }) {
    const skip = (params.page - 1) * params.limit;
    const { notifications, total } = await this.notificationRepository.listByUser({
      userId: params.userId,
      skip,
      take: params.limit,
      unreadOnly: params.unreadOnly,
      branchId: params.branchId,
    });

    return {
      notifications,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getUnreadCount(userId: string, branchId?: string | null) {
    return this.notificationRepository.countUnread(userId, branchId);
  }

  async markRead(id: string, userId: string) {
    const result = await this.notificationRepository.markRead(id, userId);
    if (result.count === 0) {
      throw new NotFoundError('Notification not found');
    }
  }

  async markAllRead(userId: string) {
    await this.notificationRepository.markAllRead(userId);
  }
}
