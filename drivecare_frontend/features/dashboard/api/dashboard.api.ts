import { apiGet } from "@/lib/api/apiClient";

export interface DashboardStats {
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
}

export async function getDashboardStats(
  branchId?: string,
): Promise<DashboardStats> {
  const query = branchId ? `?branchId=${branchId}` : "";
  return apiGet<DashboardStats>(`/dashboard/stats${query}`);
}
