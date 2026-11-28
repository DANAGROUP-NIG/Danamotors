"use client";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/apiClient";
import { jobCardKeys } from "../api/job-card.keys";
import type { GatePassPrintData, JobCardPrintData } from "../types/job-print.types";

const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status;
/** Access, not found and "not delivered yet" answers do not change on a retry. */
const retry = (count: number, error: unknown) => ![403, 404, 409].includes(statusOf(error) ?? 0) && count < 2;

/** The printed job card: the paper form filled from the stored job (phase 11). */
export function useJobCardPrint(id: string, enabled = true) {
  return useQuery({
    queryKey: [...jobCardKeys.detail(id), "print"] as const,
    queryFn: () => apiGet<JobCardPrintData>(`/service/job-cards/${id}/print`),
    enabled: enabled && !!id,
    retry,
    staleTime: 0,
  });
}

/** The A6 gate pass slip, once the vehicle is delivered. */
export function useGatePassPrint(id: string, enabled = true) {
  return useQuery({
    queryKey: [...jobCardKeys.detail(id), "print", "gate-pass"] as const,
    queryFn: () => apiGet<GatePassPrintData>(`/service/job-cards/${id}/print/gate-pass`),
    enabled: enabled && !!id,
    retry,
    staleTime: 0,
  });
}

export { statusOf as printErrorStatus };
