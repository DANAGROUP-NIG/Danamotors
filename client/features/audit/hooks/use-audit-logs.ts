import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getAuditLog, getAuditLogs } from "../api/audit.api";
import type { AuditLogParams } from "../types/audit.types";

export const auditKeys = {
  all: ["audit"] as const,
  logs: (params: AuditLogParams) => [...auditKeys.all, "logs", params] as const,
  detail: (id: string) => [...auditKeys.all, "detail", id] as const,
  stats: () => [...auditKeys.all, "stats"] as const,
};

export function useAuditLogs(params: AuditLogParams) {
  return useQuery({ queryKey: auditKeys.logs(params), queryFn: () => getAuditLogs(params), placeholderData: keepPreviousData });
}

export function useAuditLog(id: string | null) {
  return useQuery({ queryKey: auditKeys.detail(id ?? ""), queryFn: () => getAuditLog(id!), enabled: !!id });
}
