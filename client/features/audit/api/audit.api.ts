import { apiGet } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type { AuditLog, AuditLogParams, AuditLogsResponse, AuditStats } from "../types/audit.types";

export async function getAuditLogs(params: AuditLogParams): Promise<AuditLogsResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  return apiGet<AuditLogsResponse>(`${API_ROUTES.audit.logs}?${query.toString()}`);
}

export function getAuditLog(id: string): Promise<AuditLog> {
  return apiGet<AuditLog>(API_ROUTES.audit.detail(id));
}

export function getAuditStats(): Promise<AuditStats> {
  return apiGet<AuditStats>(API_ROUTES.audit.stats);
}
