import prisma from '../../prisma/client';

export class AuditRepository {
  async listLogs(params: {
    skip: number;
    take: number;
    userId?: string;
    action?: string;
    search?: string;
    dateFrom?: Date;
    dateTo?: Date;
    branchId?: string;
  }): Promise<{ logs: any[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (params.userId) {
      where.userId = params.userId;
    }

    if (params.action) {
      where.action = params.action;
    }

    if (params.search) {
      where.OR = [
        { action: { contains: params.search, mode: 'insensitive' } },
        { details: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.dateFrom || params.dateTo) {
      where.createdAt = {
        ...(params.dateFrom && { gte: params.dateFrom }),
        ...(params.dateTo && { lte: params.dateTo }),
      };
    }

    if (params.branchId) {
      where.user = {
        branchId: params.branchId,
      };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: params.skip,
        take: params.take,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              branchId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  }

  async findLogById(id: string) {
    return prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            branchId: true,
          },
        },
      },
    });
  }

  async getStats(branchId?: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const whereFilter: Record<string, unknown> = {};
    if (branchId) {
      whereFilter.user = { branchId };
    }

    const [totalLogs, todayCount, topActions, topUsers] = await Promise.all([
      prisma.auditLog.count({ where: whereFilter }),
      prisma.auditLog.count({
        where: {
          ...whereFilter,
          createdAt: { gte: startOfDay },
        },
      }),
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: { action: true },
        where: whereFilter,
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ['userId'],
        _count: { userId: true },
        where: {
          ...whereFilter,
          userId: { not: null },
        },
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
    ]);

    const topUsersWithNames = await Promise.all(
      topUsers.map(async (entry) => {
        if (!entry.userId) return null;
        const user = await prisma.user.findUnique({
          where: { id: entry.userId },
          select: { id: true, firstName: true, lastName: true },
        });
        return {
          userId: entry.userId,
          name: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
          count: entry._count.userId,
        };
      })
    );

    return {
      totalLogs,
      todayCount,
      topActions: topActions.map((a) => ({
        action: a.action,
        count: a._count.action,
      })),
      topUsers: topUsersWithNames.filter(Boolean),
    };
  }
}

export default AuditRepository;
