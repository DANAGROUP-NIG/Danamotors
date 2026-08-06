import prisma from '../../prisma/client';

export interface CreateNotificationData {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
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
  }) {
    const where = {
      userId: params.userId,
      ...(params.unreadOnly ? { readAt: null } : {}),
    };

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

  async countUnread(userId: string) {
    return prisma.notification.count({ where: { userId, readAt: null } });
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
