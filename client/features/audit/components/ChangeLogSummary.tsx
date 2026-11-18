"use client";

import { useMemo } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadExcel } from "@/lib/table-actions";
import { useChangeSummary } from "../hooks/use-change-log";
import type { ChangeLogFilters, ChangeSummaryRow } from "../types/change-log.types";
import { ChangeLogFilterBar } from "./ChangeLogFilterBar";

type PivotRow = { key: string; userName: string; outside: boolean; recordType: string; add: number; modify: number; remove: number; total: number };

function pivot(rows: ChangeSummaryRow[]): PivotRow[] {
  const byKey = new Map<string, PivotRow>();
  for (const row of rows) {
    const key = `${row.userId ?? row.source}|${row.entity}`;
    const entry = byKey.get(key) ?? { key, userName: row.userName, outside: row.source === "DB", recordType: row.entityLabel, add: 0, modify: 0, remove: 0, total: 0 };
    if (row.action === "INSERT") entry.add += row.count;
    if (row.action === "UPDATE") entry.modify += row.count;
    if (row.action === "DELETE") entry.remove += row.count;
    entry.total += row.count;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => a.userName.localeCompare(b.userName) || a.recordType.localeCompare(b.recordType));
}

/** Legacy User Activity "Summary" print: changes per user × record type, split by add / modify / delete. */
export function ChangeLogSummary({
  filters,
  onFiltersChange,
}: {
  filters: ChangeLogFilters;
  onFiltersChange: (filters: ChangeLogFilters) => void;
}) {
  const { data, isLoading, isFetching, isError } = useChangeSummary(filters);
  const rows = useMemo(() => pivot(data?.rows ?? []), [data?.rows]);
  const totals = rows.reduce((t, r) => ({ add: t.add + r.add, modify: t.modify + r.modify, remove: t.remove + r.remove, total: t.total + r.total }), { add: 0, modify: 0, remove: 0, total: 0 });

  function exportExcel() {
    downloadExcel(
      `change-summary-${new Date().toISOString().split("T")[0]}`,
      rows.map((r) => ({ user: r.userName, recordType: r.recordType, add: r.add, modify: r.modify, delete: r.remove, total: r.total })),
      [
        { key: "user", label: "User" },
        { key: "recordType", label: "Record type" },
        { key: "add", label: "Add" },
        { key: "modify", label: "Modify" },
        { key: "delete", label: "Delete" },
        { key: "total", label: "Total" },
      ],
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ChangeLogFilterBar filters={filters} onChange={onFiltersChange} />
        <Button variant="outline" size="sm" className="h-10 gap-1.5" disabled={!rows.length} onClick={exportExcel}>
          <FileSpreadsheet className="size-4" /> Excel
        </Button>
      </div>
      {isError && <p className="text-sm text-red-600">Failed to load the summary.</p>}
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : (
        <div className={`overflow-x-auto rounded-lg border ${isFetching ? "opacity-70" : ""}`}>
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Record type</th>
                <th className="px-3 py-2 text-right font-medium">Add</th>
                <th className="px-3 py-2 text-right font-medium">Modify</th>
                <th className="px-3 py-2 text-right font-medium">Delete</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className={`px-3 py-1.5 font-medium ${r.outside ? "text-amber-700" : ""}`}>{r.userName}</td>
                  <td className="px-3 py-1.5">{r.recordType}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.add || "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.modify || "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.remove || "—"}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{r.total}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No changes match these filters.</td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t bg-muted/30 font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.add}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.modify}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.remove}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.total}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
