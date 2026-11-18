import type { AuditUser } from "./audit.types";

export type ChangeAction = "INSERT" | "UPDATE" | "DELETE";
export type ChangeGroup = "MASTER" | "TRANSACTION";

/** One field of a change. A masked field (password hash, reset token) has no values. */
export type FieldChange = { field: string; old?: unknown; new?: unknown; masked?: boolean };

export type ChangeLogEntry = {
  id: string;
  at: string;
  entity: string;
  entityLabel: string;
  group: ChangeGroup | null;
  recordId: string;
  recordLabel: string | null;
  action: ChangeAction;
  changes: FieldChange[];
  /** DB: made directly in the database, outside the app. */
  source: "APP" | "DB";
  txId: string;
  dbUser: string | null;
  appName: string | null;
  clientAddr: string | null;
  user: AuditUser | null;
};

export type ChangeLogFilters = {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  /** A table name, or "MASTER" / "TRANSACTION" for every table in the group. */
  recordType?: string;
  action?: ChangeAction;
  outsideAppOnly?: boolean;
  record?: string;
};

export type ChangeLogResponse = {
  changes: ChangeLogEntry[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

export type ChangeLogEntity = { entity: string; label: string; group: ChangeGroup };

export type ChangeSummaryRow = {
  userId: string | null;
  userName: string;
  source: "APP" | "DB";
  entity: string;
  entityLabel: string;
  group: ChangeGroup | null;
  action: ChangeAction;
  count: number;
};
