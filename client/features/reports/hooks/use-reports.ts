"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getReportLookupRequest, runReportRequest, type LookupSource } from "../api/reports.api";

export function useReportQuery(slug: string, query: Record<string, string> | null) {
  return useQuery({
    queryKey: ["report", slug, query],
    queryFn: () => runReportRequest(slug, query!),
    enabled: query !== null,
    placeholderData: keepPreviousData,
    // A report is a snapshot; re-running is an explicit action.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useReportLookup(source: LookupSource, branchId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["report-lookup", source, branchId ?? "own"],
    queryFn: () => getReportLookupRequest(source, branchId),
    enabled,
    staleTime: 5 * 60_000,
  });
}
