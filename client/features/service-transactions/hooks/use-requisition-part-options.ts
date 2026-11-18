"use client";
import { useServiceData } from "./use-service-transactions";

export type RequisitionPartOption = {
  id: string;
  partNumber: string;
  name: string;
  partFlag: string;
  sourceLabel: string;
  relationship: "requested" | "main" | "alternate" | "source";
  available: number;
  normalRate: number;
  warrantyRate: number;
  warrantyApplicable: boolean;
};
export type RequisitionPartOptions = {
  requested: { id: string; partNumber: string; name: string };
  options: RequisitionPartOption[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
export function useRequisitionPartOptions(
  partId: string,
  branchId: string,
  page: number,
  source: string,
  search: string,
  enabled: boolean,
) {
  const query = new URLSearchParams({
    partId,
    branchId,
    page: String(page),
    limit: "10",
  });
  if (source) query.set("source", source);
  if (search.trim()) query.set("search", search.trim());
  return useServiceData<RequisitionPartOptions>(
    `/inventory/requisitions/part-options?${query}`,
    enabled && !!partId && !!branchId,
  );
}
