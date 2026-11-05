"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { DateInput } from "@/components/forms/DateInput";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useUsers } from "@/features/users/hooks/use-users";
import { useChangeLogEntities } from "../hooks/use-change-log";
import type { ChangeAction, ChangeLogFilters } from "../types/change-log.types";
import { ACTION_LABELS } from "./change-log-format";

const selectClass =
  "h-10 min-w-36 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

/** Filters shared by the Changes and Summary tabs (legacy User Activity Report criteria). */
export function ChangeLogFilterBar({
  filters,
  onChange,
}: {
  filters: ChangeLogFilters;
  onChange: (filters: ChangeLogFilters) => void;
}) {
  const { isSuperAdmin } = useAuth();
  const { data: usersData } = useUsers({ page: 1, limit: 100 });
  const { data: entitiesData } = useChangeLogEntities();
  const entities = entitiesData?.entities ?? [];
  const [record, setRecord] = useState(filters.record ?? "");

  const set = (patch: Partial<ChangeLogFilters>) => onChange({ ...filters, ...patch });
  const hasFilters = Object.values(filters).some((value) => value !== undefined && value !== "" && value !== false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        From <DateInput value={filters.dateFrom ?? ""} onChange={(value) => set({ dateFrom: value || undefined })} />
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        To <DateInput value={filters.dateTo ?? ""} onChange={(value) => set({ dateTo: value || undefined })} />
      </label>
      <select aria-label="User" className={selectClass} value={filters.userId ?? ""} onChange={(e) => set({ userId: e.target.value || undefined })}>
        <option value="">All users</option>
        {usersData?.users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.firstName} {user.lastName}
          </option>
        ))}
      </select>
      <select aria-label="Record type" className={selectClass} value={filters.recordType ?? ""} onChange={(e) => set({ recordType: e.target.value || undefined })}>
        <option value="">All record types</option>
        <option value="MASTER">All masters</option>
        <option value="TRANSACTION">All transactions</option>
        <optgroup label="Masters">
          {entities.filter((e) => e.group === "MASTER").map((e) => <option key={e.entity} value={e.entity}>{e.label}</option>)}
        </optgroup>
        <optgroup label="Transactions">
          {entities.filter((e) => e.group === "TRANSACTION").map((e) => <option key={e.entity} value={e.entity}>{e.label}</option>)}
        </optgroup>
      </select>
      <select aria-label="Activity" className={selectClass} value={filters.action ?? ""} onChange={(e) => set({ action: (e.target.value || undefined) as ChangeAction | undefined })}>
        <option value="">Add, modify and delete</option>
        {(Object.keys(ACTION_LABELS) as ChangeAction[]).map((action) => <option key={action} value={action}>{ACTION_LABELS[action]}</option>)}
      </select>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          set({ record: record.trim() || undefined });
        }}
      >
        <input
          aria-label="Record number, code, name or id"
          placeholder="Record no., code, name or id"
          className={`${selectClass} w-60`}
          value={record}
          onChange={(e) => setRecord(e.target.value)}
        />
        <Button type="submit" variant="outline" size="sm" className="h-10" aria-label="Search records">
          <Search className="size-4" />
        </Button>
      </form>
      {isSuperAdmin && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!filters.outsideAppOnly} onChange={(e) => set({ outsideAppOnly: e.target.checked || undefined })} />
          Outside the app only
        </label>
      )}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-10 gap-1"
          onClick={() => {
            setRecord("");
            onChange({});
          }}
        >
          <X className="size-4" /> Clear
        </Button>
      )}
    </div>
  );
}
