import prisma from '../../prisma/client';
import { NotificationRepository, CreateNotificationData } from './notification.repository';
import { NotFoundError } from '../../shared/errors/appError';

export const NOTIFICATION_TYPES = {
  // Existing
  INVOICE_PAID:        'INVOICE_PAID',
  ESTIMATE_CREATED:    'ESTIMATE_CREATED',
  APPOINTMENT_BOOKED:  'APPOINTMENT_BOOKED',
  // New
  APPOINTMENT_CREATE:   'APPOINTMENT_CREATE',
  APPOINTMENT_APPROVED: 'APPOINTMENT_APPROVED',
  APPOINTMENT_REJECTED: 'APPOINTMENT_REJECTED',
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

  async create(inputs: CreateNotificationData[]) {
    const validInputs = inputs.filter((input) => input.userId);
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
