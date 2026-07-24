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
    const dayOfWeek = startOfToday.getDay();
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYesterdayBookings = new Date(startOfToday);
    startOfYesterdayBookings.setDate(startOfYesterdayBookings.getDate() - 1);
    const endOfYesterdayBookings = new Date(startOfToday);

    // ── Batch 1: Core job stats ────────────────────────────────────
    const [
      totalJobs,
      totalJobsYesterday,
      inProgressJobs,
      inProgressJobsYesterday,
      completedJobs,
      completedJobsYesterday,
      jobsByStatus,
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
    ]);

    // ── Batch 2: Revenue + chart + tech + inventory ────────────────
    const [
      revenueResult,
      revenueYesterdayResult,
      revenueChart,
      topTechniciansRaw,
      inventoryAlerts,
    ] = await Promise.all([
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
      branchId
        ? prisma.$queryRaw<{ day: string; value: number }[]>`
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
          `
        : prisma.$queryRaw<{ day: string; value: number }[]>`
            SELECT
              TO_CHAR(p."paymentDate", 'Dy') AS day,
              COALESCE(SUM(p."amount"), 0)::float AS value
            FROM "Payment" p
            JOIN "Invoice" i ON p."invoiceId" = i."id"
            WHERE p."paymentDate" >= ${sevenDaysAgo}
            GROUP BY TO_CHAR(p."paymentDate", 'Dy'), DATE(p."paymentDate")
            ORDER BY DATE(p."paymentDate") ASC
          `,
      branchId
        ? prisma.$queryRaw<
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
          `
        : prisma.$queryRaw<
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
          `,
      prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM "SparePart"
        WHERE "minimumStock" > 0
          AND "stock" <= "minimumStock"
      `.then((r) => r[0]?.count ?? 0).catch(() => 0),
    ]);

    // ── Batch 3: Technician + receptionist ──────────────────────────
    const [
      myAssignedJobs,
      myCompletedJobs,
      myJobsByStatus,
      upcomingAppointments,
      todayBookings,
      pendingAppointments,
      yesterdayBookings,
      weekBookings,
    ] = await Promise.all([
      userId
        ? prisma.jobCard.count({ where: { technicianId: userId, ...jobWhere } })
        : Promise.resolve(0),
      userId
        ? prisma.jobCard.count({ where: { technicianId: userId, status: 'Closed', ...jobWhere } })
        : Promise.resolve(0),
      userId
        ? prisma.jobCard.groupBy({ by: ['status'], where: { technicianId: userId, ...jobWhere }, _count: { id: true } })
        : Promise.resolve([]),
      prisma.serviceAppointment.findMany({
        where: {
          scheduledAt: { gte: startOfToday },
          status: { in: ['Pending', 'Confirmed'] },
          ...(branchId ? { branchId } : {}),
        },
        include: {
          customer: { select: { firstName: true, lastName: true } },
          vehicle: { select: { make: true, model: true, year: true } },
          branch: { select: { name: true } },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 10,
      }),
      prisma.serviceAppointment.count({
        where: {
          scheduledAt: { gte: startOfToday, lt: new Date(startOfToday.getTime() + 86400000) },
          ...(branchId ? { branchId } : {}),
        },
      }),
      prisma.serviceAppointment.count({
        where: { status: 'Pending', ...(branchId ? { branchId } : {}) },
      }),
      prisma.serviceAppointment.count({
        where: {
          scheduledAt: { gte: startOfYesterdayBookings, lt: endOfYesterdayBookings },
          ...(branchId ? { branchId } : {}),
        },
      }),
      prisma.serviceAppointment.count({
        where: { scheduledAt: { gte: startOfWeek }, ...(branchId ? { branchId } : {}) },
      }),
    ]);

    // ── Batch 4: Remaining receptionist + accountant ───────────────
    const [
      last7DaysBookings,
      monthBookings,
      lastMonthBookings,
      bookingsByStatus,
      openInvoices,
      overdueInvoices,
      totalOutstanding,
      monthlyRevenue,
    ] = await Promise.all([
      prisma.serviceAppointment.count({
        where: { scheduledAt: { gte: sevenDaysAgo }, ...(branchId ? { branchId } : {}) },
      }),
      prisma.serviceAppointment.count({
        where: { scheduledAt: { gte: startOfMonth }, ...(branchId ? { branchId } : {}) },
      }),
      prisma.serviceAppointment.count({
        where: {
          scheduledAt: {
            gte: new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() - 1, 1),
            lt: startOfMonth,
          },
          ...(branchId ? { branchId } : {}),
        },
      }),
      prisma.serviceAppointment.groupBy({
        by: ['status'],
        where: { ...(branchId ? { branchId } : {}) },
        _count: { id: true },
      }),
      prisma.invoice.count({
        where: {
          status: { in: ['Unpaid', 'Partially Paid'] },
          ...(branchId ? { jobCard: { branchId } } : {}),
        },
      }),
      prisma.invoice.count({
        where: {
          status: { in: ['Unpaid', 'Partially Paid'] },
          dueDate: { lt: now },
          ...(branchId ? { jobCard: { branchId } } : {}),
        },
      }),
      prisma.invoice.aggregate({
        where: {
          status: { in: ['Unpaid', 'Partially Paid'] },
          ...(branchId ? { jobCard: { branchId } } : {}),
        },
        _sum: { total: true },
      }),
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

    const myJobsByStatusFormatted = (myJobsByStatus as any[]).map((s: any) => ({
      name: s.status,
      value: s._count.id,
      color: statusColors[s.status] ?? '#94a3b8',
    }));

    const myCompletionRate = (myAssignedJobs as number) > 0
      ? Math.round(((myCompletedJobs as number) / (myAssignedJobs as number)) * 100)
      : 0;

    const formattedAppointments = (upcomingAppointments as any[]).map((a: any) => ({
      id: a.id,
      scheduledAt: a.scheduledAt,
      customerName: a.customer
        ? `${a.customer.firstName} ${a.customer.lastName}`
        : 'Unknown',
      vehicle: a.vehicle
        ? `${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}`
        : 'Unknown',
      branch: a.branch?.name ?? 'Unknown',
      status: a.status,
    }));

    const bookingStatusColors: Record<string, string> = {
      'Pending': '#f59e0b',
      'Confirmed': '#22c55e',
      'Checked In': '#2563eb',
      'Inspection': '#7c3aed',
      'In Repair': '#f97316',
      'Awaiting Approval': '#0ea5e9',
      'Quality Check': '#8b5cf6',
      'Ready': '#10b981',
      'Completed': '#22c55e',
      'Cancelled': '#ef4444',
    };

    const bookingsByStatusFormatted = (bookingsByStatus as any[]).map((s: any) => ({
      name: s.status,
      value: s._count.id,
      color: bookingStatusColors[s.status] ?? '#94a3b8',
    }));

    const weekBookingsDelta = (last7DaysBookings as number) > 0
      ? Math.round((((weekBookings as number) - (last7DaysBookings as number)) / Math.max(last7DaysBookings as number, 1)) * 100 * 10) / 10
      : (weekBookings as number) > 0 ? 100 : 0;

    const monthBookingsDelta = (lastMonthBookings as number) > 0
      ? Math.round((((monthBookings as number) - (lastMonthBookings as number)) / (lastMonthBookings as number)) * 100 * 10) / 10
      : (monthBookings as number) > 0 ? 100 : 0;

    const totalOutstandingAmount = Number((totalOutstanding as any)._sum?.total ?? 0);
    const monthlyRevenueAmount = Number((monthlyRevenue as any)._sum?.amount ?? 0);

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
      myAssignedJobs,
      myCompletedJobs,
      myCompletionRate,
      myJobsByStatus: myJobsByStatusFormatted,
      upcomingAppointments: formattedAppointments,
      todayBookings,
      pendingAppointments,
      yesterdayBookings,
      weekBookings,
      last7DaysBookings,
      monthBookings,
      lastMonthBookings,
      weekBookingsDelta,
      monthBookingsDelta,
      bookingsByStatus: bookingsByStatusFormatted,
      openInvoices,
      overdueInvoices,
      totalOutstanding: totalOutstandingAmount,
      monthlyRevenue: monthlyRevenueAmount,
    };
  }
}

export default DashboardService;
