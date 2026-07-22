import prisma from '../../prisma/client';

export class DashboardService {
  async getStats(branchId?: string, userId?: string) {
    const jobWhere: any = {};
    if (branchId) jobWhere.branchId = branchId;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const thirtyDaysAgo = new Date(startOfToday);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

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
      // Technician-specific
      myAssignedJobs,
      myCompletedJobs,
      myJobsByStatus,
      // Receptionist-specific
      upcomingAppointments,
      todayBookings,
      pendingAppointments,
      // Accountant-specific
      openInvoices,
      overdueInvoices,
      totalOutstanding,
      monthlyRevenue,
    ] = await Promise.all([
      // ── Core stats ──────────────────────────────────────────────
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

      // Revenue chart
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

      // Top technicians
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

      // Inventory alerts
      prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM "SparePart"
        WHERE "minimumStock" > 0
          AND "stock" <= "minimumStock"
      `.then((r) => r[0]?.count ?? 0).catch(() => 0),

      // ── Technician-specific ─────────────────────────────────────
      userId
        ? prisma.jobCard.count({
            where: { technicianId: userId, ...jobWhere },
          })
        : Promise.resolve(0),

      userId
        ? prisma.jobCard.count({
            where: { technicianId: userId, status: 'Closed', ...jobWhere },
          })
        : Promise.resolve(0),

      userId
        ? prisma.jobCard.groupBy({
            by: ['status'],
            where: { technicianId: userId, ...jobWhere },
            _count: { id: true },
          })
        : Promise.resolve([]),

      // ── Receptionist-specific ───────────────────────────────────
      // Upcoming appointments (from now onwards)
      prisma.serviceAppointment.findMany({
        where: {
          scheduledAt: { gte: startOfToday },
          status: { in: ['Pending', 'Confirmed'] },
          ...(branchId ? { branchId } : {}),
        },
        include: {
          customer: { include: { user: { select: { firstName: true, lastName: true } } } },
          vehicle: { select: { make: true, model: true, year: true } },
          branch: { select: { name: true } },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 10,
      }),

      // Today's bookings count
      prisma.serviceAppointment.count({
        where: {
          scheduledAt: { gte: startOfToday, lt: new Date(startOfToday.getTime() + 86400000) },
          ...(branchId ? { branchId } : {}),
        },
      }),

      // Pending appointments count
      prisma.serviceAppointment.count({
        where: {
          status: 'Pending',
          ...(branchId ? { branchId } : {}),
        },
      }),

      // ── Accountant-specific ─────────────────────────────────────
      // Open (Unpaid) invoices
      prisma.invoice.count({
        where: {
          status: { in: ['Unpaid', 'Partially Paid'] },
          ...(branchId ? { jobCard: { branchId } } : {}),
        },
      }),

      // Overdue invoices
      prisma.invoice.count({
        where: {
          status: { in: ['Unpaid', 'Partially Paid'] },
          dueDate: { lt: now },
          ...(branchId ? { jobCard: { branchId } } : {}),
        },
      }),

      // Total outstanding amount
      prisma.invoice.aggregate({
        where: {
          status: { in: ['Unpaid', 'Partially Paid'] },
          ...(branchId ? { jobCard: { branchId } } : {}),
        },
        _sum: { total: true },
      }),

      // Monthly revenue (last 30 days)
      prisma.payment.aggregate({
        where: {
          paymentDate: { gte: thirtyDaysAgo },
          ...(branchId ? { invoice: { jobCard: { branchId } } } : {}),
        },
        _sum: { amount: true },
      }),
    ]);

    // ── Format core data ────────────────────────────────────────────
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

    // ── Format technician data ──────────────────────────────────────
    const myJobsByStatusFormatted = (myJobsByStatus as any[]).map((s: any) => ({
      name: s.status,
      value: s._count.id,
      color: statusColors[s.status] ?? '#94a3b8',
    }));

    const myCompletionRate = (myAssignedJobs as number) > 0
      ? Math.round(((myCompletedJobs as number) / (myAssignedJobs as number)) * 100)
      : 0;

    // ── Format receptionist data ────────────────────────────────────
    const formattedAppointments = (upcomingAppointments as any[]).map((a: any) => ({
      id: a.id,
      scheduledAt: a.scheduledAt,
      customerName: a.customer?.user
        ? `${a.customer.user.firstName} ${a.customer.user.lastName}`
        : 'Unknown',
      vehicle: a.vehicle
        ? `${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}`
        : 'Unknown',
      branch: a.branch?.name ?? 'Unknown',
      status: a.status,
    }));

    // ── Format accountant data ──────────────────────────────────────
    const totalOutstandingAmount = Number((totalOutstanding as any)._sum?.total ?? 0);
    const monthlyRevenueAmount = Number((monthlyRevenue as any)._sum?.amount ?? 0);

    return {
      // Core
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
      // Technician
      myAssignedJobs,
      myCompletedJobs,
      myCompletionRate,
      myJobsByStatus: myJobsByStatusFormatted,
      // Receptionist
      upcomingAppointments: formattedAppointments,
      todayBookings,
      pendingAppointments,
      // Accountant
      openInvoices,
      overdueInvoices,
      totalOutstanding: totalOutstandingAmount,
      monthlyRevenue: monthlyRevenueAmount,
    };
  }
}

export default DashboardService;
