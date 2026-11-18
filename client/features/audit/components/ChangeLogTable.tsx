"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileSpreadsheet, Link2 } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import { copyToClipboard, downloadCsv, downloadExcel } from "@/lib/table-actions";
import { useChangeLog } from "../hooks/use-change-log";
import type { ChangeLogEntry, ChangeLogFilters } from "../types/change-log.types";
import { ChangeLogFilterBar } from "./ChangeLogFilterBar";
import { ActionBadge } from "./ChangeDetailModal";
import { changedBy, EXPORT_COLUMNS, fieldLabel, formatAt, toExportRows } from "./change-log-format";

const PAGE_SIZE = 25;

function exportName() {
  return `change-log-${new Date().toISOString().split("T")[0]}`;
}

export function ChangeLogTable({
  filters,
  onFiltersChange,
  onOpen,
}: {
  filters: ChangeLogFilters;
  onFiltersChange: (filters: ChangeLogFilters) => void;
  onOpen: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useChangeLog(filters, page, PAGE_SIZE);
  const changes = useMemo(() => data?.changes ?? [], [data?.changes]);
  const total = data?.meta.total ?? 0;
  const selection = useDataTableSelection<ChangeLogEntry>({ data: changes, rowKey: (entry) => entry.id });

  useEffect(() => setPage(1), [filters]);

  const columns: Column<ChangeLogEntry>[] = [
    { header: "Time", className: "whitespace-nowrap text-muted-foreground", render: (entry) => formatAt(entry.at) },
    {
      header: "By",
      render: (entry) => (
        <span className={entry.source === "DB" ? "font-medium text-amber-700" : "font-medium"}>{changedBy(entry)}</span>
      ),
    },
    {
      header: "Record",
      render: (entry) => (
        <div>
          <p className="font-medium">{entry.recordLabel || entry.recordId}</p>
          <p className="text-xs text-muted-foreground">{entry.entityLabel}</p>
        </div>
      ),
    },
    { header: "Activity", className: "whitespace-nowrap", render: (entry) => <ActionBadge entry={entry} /> },
    {
      header: "Fields",
      render: (entry) => {
        const names = entry.changes.map((c) => fieldLabel(c.field));
        return (
          <button type="button" className="block max-w-sm truncate text-left text-muted-foreground hover:underline" title={names.join(", ")} onClick={() => onOpen(entry.id)}>
            {entry.action === "UPDATE" ? names.join(", ") : `${names.length} field${names.length === 1 ? "" : "s"}`}
          </button>
        );
      },
    },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (entry) => (
        <DataTableRowActions
          item={entry}
          quickActions={[{ id: "view", label: "View changes", icon: <Eye className="size-3.5" />, onClick: () => onOpen(entry.id) }]}
          actions={[
            { id: "view", label: "View details", icon: <Eye className="size-4" />, onClick: () => onOpen(entry.id) },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              onClick: () => copyToClipboard(`${window.location.href.split("?")[0]}?change=${entry.id}`, "Link copied"),
            },
          ]}
        />
      ),
    },
  ];

  if (isError) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">Failed to load the change log.</div>;
  }

  return (
    <DataTable
      columns={columns}
      data={changes}
      isLoading={isLoading}
      isFetching={isFetching}
      rowKey={(entry) => entry.id}
      emptyMessage="No changes match these filters."
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
      totalPages={data?.meta.totalPages ?? 1}
      onPageChange={setPage}
      selection={selection}
    >
      <div className="flex flex-col gap-4">
        <ChangeLogFilterBar filters={filters} onChange={onFiltersChange} />
        <DataTableBulkToolbar
          selectedCount={selection.selectedIds.size}
          totalCount={total}
          selectedItems={selection.selectedItems}
          onClear={selection.clear}
          actions={[
            { id: "csv", label: "CSV", icon: <Download className="size-3.5" />, variant: "ghost", onClick: (items: ChangeLogEntry[]) => downloadCsv(exportName(), toExportRows(items), EXPORT_COLUMNS) },
            { id: "excel", label: "Excel", icon: <FileSpreadsheet className="size-3.5" />, variant: "ghost", onClick: (items: ChangeLogEntry[]) => downloadExcel(exportName(), toExportRows(items), EXPORT_COLUMNS) },
          ]}
        />
      </div>
    </DataTable>
  );
}
