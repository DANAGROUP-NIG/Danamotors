import { apiGet } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  ChangeLogEntity,
  ChangeLogEntry,
  ChangeLogFilters,
  ChangeLogResponse,
  ChangeSummaryRow,
} from "../types/change-log.types";

function filterQuery(filters: ChangeLogFilters): URLSearchParams {
  const query = new URLSearchParams();
  if (filters.dateFrom) query.set("dateFrom", new Date(`${filters.dateFrom}T00:00:00`).toISOString());
  if (filters.dateTo) query.set("dateTo", new Date(`${filters.dateTo}T23:59:59.999`).toISOString());
  if (filters.userId) query.set("userId", filters.userId);
  if (filters.recordType === "MASTER" || filters.recordType === "TRANSACTION") query.set("group", filters.recordType);
  else if (filters.recordType) query.set("entity", filters.recordType);
  if (filters.action) query.set("action", filters.action);
  if (filters.outsideAppOnly) query.set("outsideAppOnly", "true");
  if (filters.record?.trim()) query.set("record", filters.record.trim());
  return query;
}

export function getChangeLog(filters: ChangeLogFilters, page: number, limit: number): Promise<ChangeLogResponse> {
  const query = filterQuery(filters);
  query.set("page", String(page));
  query.set("limit", String(limit));
  return apiGet<ChangeLogResponse>(`${API_ROUTES.audit.changes}?${query.toString()}`);
}

export function getChangeSummary(filters: ChangeLogFilters): Promise<{ rows: ChangeSummaryRow[]; total: number }> {
  return apiGet(`${API_ROUTES.audit.changeSummary}?${filterQuery(filters).toString()}`);
}

export function getChangeLogEntities(): Promise<{ entities: ChangeLogEntity[] }> {
  return apiGet(API_ROUTES.audit.changeEntities);
}

export function getRecordHistory(entity: string, recordId: string): Promise<{ changes: ChangeLogEntry[] }> {
  return apiGet(API_ROUTES.audit.recordHistory(entity, recordId));
}

export function getChange(id: string): Promise<{ change: ChangeLogEntry }> {
  return apiGet(API_ROUTES.audit.change(id));
}
