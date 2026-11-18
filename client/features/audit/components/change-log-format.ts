import type { ChangeAction, ChangeLogEntry, FieldChange } from "../types/change-log.types";

/** Legacy User Activity words: Add / Modify / Delete. */
export const ACTION_LABELS: Record<ChangeAction, string> = { INSERT: "Add", UPDATE: "Modify", DELETE: "Delete" };

export const ACTION_COLORS: Record<ChangeAction, string> = {
  INSERT: "bg-green-50 text-green-700",
  UPDATE: "bg-blue-50 text-blue-700",
  DELETE: "bg-red-50 text-red-700",
};

/** "registrationNumber" → "Registration number". */
export function fieldLabel(field: string): string {
  const words = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && ISO_DATE.test(value)) {
    const date = new Date(value);
    const midnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
    return midnight ? date.toLocaleDateString(undefined, { dateStyle: "medium" }) : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function formatFieldChange(change: FieldChange): { field: string; old: string; new: string } {
  if (change.masked) return { field: fieldLabel(change.field), old: "(hidden)", new: "(changed)" };
  return { field: fieldLabel(change.field), old: formatValue(change.old), new: formatValue(change.new) };
}

export function changedBy(entry: ChangeLogEntry): string {
  if (entry.user) return `${entry.user.firstName} ${entry.user.lastName}`.trim();
  if (entry.source === "DB") return `Outside the app${entry.dbUser ? ` (${entry.dbUser})` : ""}`;
  return "System";
}

export function formatAt(at: string): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

/** One export row per changed field, like legacy's detail print. */
export function toExportRows(entries: ChangeLogEntry[]) {
  return entries.flatMap((entry) => {
    const base = {
      time: formatAt(entry.at),
      user: changedBy(entry),
      source: entry.source === "DB" ? "Outside the app" : "App",
      recordType: entry.entityLabel,
      record: entry.recordLabel ?? "",
      recordId: entry.recordId,
      action: ACTION_LABELS[entry.action],
    };
    if (!entry.changes.length) return [{ ...base, field: "", oldValue: "", newValue: "" }];
    return entry.changes.map((change) => {
      const formatted = formatFieldChange(change);
      return { ...base, field: formatted.field, oldValue: formatted.old, newValue: formatted.new };
    });
  });
}

export const EXPORT_COLUMNS = [
  { key: "time", label: "Time" },
  { key: "user", label: "User" },
  { key: "source", label: "Source" },
  { key: "recordType", label: "Record type" },
  { key: "record", label: "Record" },
  { key: "recordId", label: "Record id" },
  { key: "action", label: "Activity" },
  { key: "field", label: "Field" },
  { key: "oldValue", label: "Old value" },
  { key: "newValue", label: "New value" },
];
