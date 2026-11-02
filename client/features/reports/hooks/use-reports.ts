"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { getReportLookupRequest, getReportSettingsRequest, runReportRequest, saveReportSettingsRequest, type LookupSource } from "../api/reports.api";

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

export function useReportSettings(enabled = true) {
  return useQuery({ queryKey: ["report-settings"], queryFn: getReportSettingsRequest, enabled, staleTime: 5 * 60_000 });
}

export function useSaveReportSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveReportSettingsRequest,
    onSuccess: (data) => {
      qc.setQueryData(["report-settings"], data);
      toast.success(data.fpcLetterIsDefault ? "Letter reset to the default template" : "Letter template saved");
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not save the letter template")),
  });
}
