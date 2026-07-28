import { apiGet } from "@/lib/api/apiClient";

export interface DashboardStats {
  // Core
  todayRevenue: number;
  revenueDelta: number;
  totalJobs: number;
  jobsDelta: number;
  inProgressJobs: number;
  inProgressDelta: number;
  completedJobs: number;
  completedDelta: number;
  jobsByStatus: { name: string; value: number; color: string }[];
  revenueChart: { day: string; value: number }[];
  topTechnicians: { rank: number; name: string; jobs: number; rate: number }[];
  inventoryAlerts: number;
  // Technician
  myAssignedJobs: number;
  myCompletedJobs: number;
  myCompletionRate: number;
  myJobsByStatus: { name: string; value: number; color: string }[];
  // Receptionist
  upcomingAppointments: {
    id: string;
    scheduledAt: string;
    customerName: string;
    vehicle: string;
    branch: string;
    status: string;
  }[];
  todayBookings: number;
  pendingAppointments: number;
  yesterdayBookings: number;
  weekBookings: number;
  last7DaysBookings: number;
  monthBookings: number;
  lastMonthBookings: number;
  weekBookingsDelta: number;
  monthBookingsDelta: number;
  bookingsByStatus: { name: string; value: number; color: string }[];
  // Accountant
  openInvoices: number;
  overdueInvoices: number;
  totalOutstanding: number;
  monthlyRevenue: number;
  // ReceptionManager
  totalReceptionists: number;
  receptionistPerformance: {
    name: string;
    branch: string;
    appointmentsCreated: number;
    completionRate: number;
  }[];
  // Receptionist personal stats
  todayAvailableAppointments: { id: string; status: string; scheduledAt: string }[];
  myTotalBookings: number;
  myTodayBookings: number;
  myYesterdayBookings: number;
  myWeekBookings: number;
  myLastMonthBookings: number;
}

export async function getDashboardStats(
  branchId?: string,
): Promise<DashboardStats> {
  const query = branchId ? `?branchId=${branchId}` : "";
  return apiGet<DashboardStats>(`/dashboard/stats${query}`);
}
