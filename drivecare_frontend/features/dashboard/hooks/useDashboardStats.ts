"use client";

import { useQuery } from "@tanstack/react-query";
import { useBranchStore } from "@/store/branch.store";
import { getDashboardStats, type DashboardStats } from "../api/dashboard.api";
import { dashboardKeys } from "../api/dashboard.keys";

export function useDashboardStats() {
  const activeBranch = useBranchStore((s) => s.activeBranch);

  return useQuery<DashboardStats>({
    queryKey: dashboardKeys.stats(activeBranch?.id),
    queryFn: () => getDashboardStats(activeBranch?.id),
    enabled: true,
    placeholderData: (prev) => prev,
  });
}
