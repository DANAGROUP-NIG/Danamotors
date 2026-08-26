import { apiGet } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  AuditLog,
  AuditLogDetailResponse,
  AuditLogParams,
  AuditLogsResponse,
  AuditStats,
} from "../types/audit.types";

export async function getAuditLogs(params: AuditLogParams): Promise<AuditLogsResponse> {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.userId) query.set("userId", params.userId);
  if (params.action) query.set("action", params.action);
  if (params.search) query.set("search", params.search);
  if (params.dateFrom) query.set("dateFrom", `${params.dateFrom}T00:00:00.000Z`);
  if (params.dateTo) query.set("dateTo", `${params.dateTo}T23:59:59.999Z`);
  return apiGet<AuditLogsResponse>(`${API_ROUTES.audit.logs}?${query.toString()}`);
}

export function getAuditLog(id: string): Promise<AuditLog> {
  return apiGet<AuditLogDetailResponse>(API_ROUTES.audit.detail(id)).then(
    ({ log }) => log,
  );
}

export function getAuditStats(): Promise<AuditStats> {
  return apiGet<AuditStats>(API_ROUTES.audit.stats);
}
