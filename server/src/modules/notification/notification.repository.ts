import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';

export interface CreateNotificationData {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  branchId?: string | null;
}

export class NotificationRepository {
  async createMany(data: CreateNotificationData[]) {
    return prisma.notification.createMany({
      data,
    });
  }

  async listByUser(params: {
    userId: string;
    skip: number;
    take: number;
    unreadOnly?: boolean;
    branchId?: string | null;
  }) {
    const where: Prisma.NotificationWhereInput = {
      userId: params.userId,
      ...(params.unreadOnly ? { readAt: null } : {}),
    };
    if (params.branchId) {
      where.OR = [{ branchId: params.branchId }, { branchId: null }];
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, total };
  }

  async countUnread(userId: string, branchId?: string | null) {
    const where: Prisma.NotificationWhereInput = { userId, readAt: null };
    if (branchId) {
      where.OR = [{ branchId }, { branchId: null }];
    }
    return prisma.notification.count({ where });
  }

  async markRead(id: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
