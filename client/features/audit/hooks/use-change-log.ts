import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getChange, getChangeLog, getChangeLogEntities, getChangeSummary, getRecordHistory } from "../api/change-log.api";
import type { ChangeLogFilters } from "../types/change-log.types";

export const changeLogKeys = {
  all: ["change-log"] as const,
  list: (filters: ChangeLogFilters, page: number, limit: number) => [...changeLogKeys.all, "list", filters, page, limit] as const,
  summary: (filters: ChangeLogFilters) => [...changeLogKeys.all, "summary", filters] as const,
  entities: () => [...changeLogKeys.all, "entities"] as const,
  detail: (id: string) => [...changeLogKeys.all, "detail", id] as const,
  history: (entity: string, recordId: string) => [...changeLogKeys.all, "history", entity, recordId] as const,
};

export function useChangeLog(filters: ChangeLogFilters, page: number, limit: number, enabled = true) {
  return useQuery({
    queryKey: changeLogKeys.list(filters, page, limit),
    queryFn: () => getChangeLog(filters, page, limit),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useChangeSummary(filters: ChangeLogFilters) {
  return useQuery({ queryKey: changeLogKeys.summary(filters), queryFn: () => getChangeSummary(filters), placeholderData: keepPreviousData });
}

export function useChangeLogEntities() {
  return useQuery({ queryKey: changeLogKeys.entities(), queryFn: getChangeLogEntities, staleTime: Infinity });
}

export function useRecordHistory(entity: string | null, recordId: string | null) {
  return useQuery({
    queryKey: changeLogKeys.history(entity ?? "", recordId ?? ""),
    queryFn: () => getRecordHistory(entity!, recordId!),
    enabled: !!entity && !!recordId,
  });
}

export function useChange(id: string | null) {
  return useQuery({ queryKey: changeLogKeys.detail(id ?? ""), queryFn: () => getChange(id!), enabled: !!id });
}
