import prisma from '../../prisma/client';

export class DashboardService {
  async getStats(branchId?: string) {
    const jobWhere: any = {};
    if (branchId) jobWhere.branchId = branchId;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const [
      totalJobs,
      totalJobsYesterday,
      inProgressJobs,
      inProgressJobsYesterday,
      completedJobs,
      completedJobsYesterday,
      jobsByStatus,
      revenueResult,
      revenueYesterdayResult,
      revenueChart,
      topTechniciansRaw,
      inventoryAlerts,
    ] = await Promise.all([
      prisma.jobCard.count({ where: jobWhere }),

      prisma.jobCard.count({
        where: { ...jobWhere, createdAt: { gte: startOfYesterday, lt: startOfToday } },
      }),

      prisma.jobCard.count({
        where: { ...jobWhere, status: 'In Progress' },
      }),

      prisma.jobCard.count({
        where: {
          ...jobWhere,
          status: 'In Progress',
          updatedAt: { gte: startOfYesterday, lt: startOfToday },
        },
      }),

      prisma.jobCard.count({
        where: { ...jobWhere, status: 'Closed' },
      }),

      prisma.jobCard.count({
        where: {
          ...jobWhere,
          status: 'Closed',
          updatedAt: { gte: startOfYesterday, lt: startOfToday },
        },
      }),

      prisma.jobCard.groupBy({
        by: ['status'],
        where: jobWhere,
        _count: { id: true },
      }),

      prisma.payment.aggregate({
        where: {
          paymentDate: { gte: startOfToday },
          ...(branchId ? { invoice: { jobCard: { branchId } } } : {}),
        },
        _sum: { amount: true },
      }),

      prisma.payment.aggregate({
        where: {
          paymentDate: { gte: startOfYesterday, lt: startOfToday },
          ...(branchId ? { invoice: { jobCard: { branchId } } } : {}),
        },
        _sum: { amount: true },
      }),

      // Revenue chart — build query dynamically for optional branch join
      (() => {
        if (branchId) {
          return prisma.$queryRaw<{ day: string; value: number }[]>`
            SELECT
              TO_CHAR(p."paymentDate", 'Dy') AS day,
              COALESCE(SUM(p."amount"), 0)::float AS value
            FROM "Payment" p
            JOIN "Invoice" i ON p."invoiceId" = i."id"
            JOIN "JobCard" j ON i."jobCardId" = j."id"
            WHERE p."paymentDate" >= ${sevenDaysAgo}
              AND j."branchId" = ${branchId}
            GROUP BY TO_CHAR(p."paymentDate", 'Dy'), DATE(p."paymentDate")
            ORDER BY DATE(p."paymentDate") ASC
          `;
        }
        return prisma.$queryRaw<{ day: string; value: number }[]>`
          SELECT
            TO_CHAR(p."paymentDate", 'Dy') AS day,
            COALESCE(SUM(p."amount"), 0)::float AS value
          FROM "Payment" p
          JOIN "Invoice" i ON p."invoiceId" = i."id"
          WHERE p."paymentDate" >= ${sevenDaysAgo}
          GROUP BY TO_CHAR(p."paymentDate", 'Dy'), DATE(p."paymentDate")
          ORDER BY DATE(p."paymentDate") ASC
        `;
      })(),

      // Top technicians — build query dynamically
      (() => {
        if (branchId) {
          return prisma.$queryRaw<
            { firstName: string; lastName: string; jobCount: number; completedCount: number }[]
          >`
            SELECT
              u."firstName",
              u."lastName",
              COUNT(j."id")::int AS "jobCount",
              COUNT(CASE WHEN j."status" = 'Closed' THEN 1 END)::int AS "completedCount"
            FROM "User" u
            JOIN "JobCard" j ON j."technicianId" = u."id"
            WHERE j."branchId" = ${branchId}
            GROUP BY u."id", u."firstName", u."lastName"
            ORDER BY "jobCount" DESC
            LIMIT 5
          `;
        }
        return prisma.$queryRaw<
          { firstName: string; lastName: string; jobCount: number; completedCount: number }[]
        >`
          SELECT
            u."firstName",
            u."lastName",
            COUNT(j."id")::int AS "jobCount",
            COUNT(CASE WHEN j."status" = 'Closed' THEN 1 END)::int AS "completedCount"
          FROM "User" u
          JOIN "JobCard" j ON j."technicianId" = u."id"
          GROUP BY u."id", u."firstName", u."lastName"
          ORDER BY "jobCount" DESC
          LIMIT 5
        `;
      })(),

      // Inventory alerts — parts at or below minimum stock level
      prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM "SparePart"
        WHERE "minimumStock" > 0
          AND "stock" <= "minimumStock"
      `.then((r) => r[0]?.count ?? 0).catch(() => 0),
    ]);

    const todayRevenue = Number(revenueResult._sum.amount ?? 0);
    const yesterdayRevenue = Number(revenueYesterdayResult._sum.amount ?? 0);
    const revenueDelta = yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 * 10) / 10
      : todayRevenue > 0 ? 100 : 0;

    const jobsDelta = totalJobsYesterday > 0
      ? Math.round(((totalJobs - totalJobsYesterday) / totalJobsYesterday) * 100 * 10) / 10
      : totalJobs > 0 ? 100 : 0;

    const inProgressDelta = inProgressJobsYesterday > 0
      ? Math.round(((inProgressJobs - inProgressJobsYesterday) / inProgressJobsYesterday) * 100 * 10) / 10
      : 0;

    const completedDelta = completedJobsYesterday > 0
      ? Math.round(((completedJobs - completedJobsYesterday) / completedJobsYesterday) * 100 * 10) / 10
      : completedJobs > 0 ? 100 : 0;

    const statusColors: Record<string, string> = {
      'Open': '#2563eb',
      'In Progress': '#f97316',
      'Closed': '#22c55e',
    };

    const jobsByStatusFormatted = jobsByStatus.map((s) => ({
      name: s.status,
      value: s._count.id,
      color: statusColors[s.status] ?? '#94a3b8',
    }));

    const revenueChartFormatted = revenueChart.map((r) => ({
      day: r.day,
      value: Number(r.value),
    }));

    const topTechnicians = topTechniciansRaw.map((t, i) => ({
      rank: i + 1,
      name: `${t.firstName} ${t.lastName}`,
      jobs: t.jobCount,
      rate: t.jobCount > 0 ? Math.round((t.completedCount / t.jobCount) * 100) : 0,
    }));

    return {
      todayRevenue,
      revenueDelta,
      totalJobs,
      jobsDelta,
      inProgressJobs,
      inProgressDelta,
      completedJobs,
      completedDelta,
      jobsByStatus: jobsByStatusFormatted,
      revenueChart: revenueChartFormatted,
      topTechnicians,
      inventoryAlerts,
    };
  }
}

export default DashboardService;
