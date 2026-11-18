"use client";

import { useEffect, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useAuditLogs } from "@/features/audit/hooks/use-audit-logs";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";
import { cn } from "@/lib/utils";
import type { AuditLog } from "@/features/audit/types/audit.types";
import { useChangeLog } from "../hooks/use-change-log";
import type { ChangeLogFilters } from "../types/change-log.types";
import { AuditLogTable } from "./AuditLogTable";
import { AuditStatsCards } from "./AuditStatsCards";
import { ChangeLogTable } from "./ChangeLogTable";
import { ChangeLogSummary } from "./ChangeLogSummary";
import { ChangeDetailModal } from "./ChangeDetailModal";
import { EXPORT_COLUMNS, toExportRows } from "./change-log-format";

const TABS = [
  { id: "changes", label: "Changes" },
  { id: "summary", label: "Summary" },
  { id: "events", label: "Events" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Export of the filtered change log, one row per changed field (up to 5,000 changes). */
function ChangeLogExport({ filters }: { filters: ChangeLogFilters }) {
  const [requested, setRequested] = useState<"csv" | "excel" | null>(null);
  const { data, isFetching } = useChangeLog(filters, 1, 5000, requested !== null);

  useEffect(() => {
    if (!requested || isFetching || !data) return;
    const filename = `change-log-${new Date().toISOString().split("T")[0]}`;
    const rows = toExportRows(data.changes);
    if (requested === "csv") downloadCsv(filename, rows, EXPORT_COLUMNS);
    else downloadExcel(filename, rows, EXPORT_COLUMNS);
    setRequested(null);
  }, [requested, isFetching, data]);

  return (
    <ActionMenu
      trigger={
        <Button variant="outline" size="sm" disabled={requested !== null} className="h-9 gap-1.5">
          <Download className="size-4" />
          {requested ? "Preparing…" : "Export"}
        </Button>
      }
    >
      <ActionMenuItem icon={<Download className="size-4" />} onClick={() => setRequested("csv")}>
        Export CSV
      </ActionMenuItem>
      <ActionMenuItem icon={<FileSpreadsheet className="size-4" />} onClick={() => setRequested("excel")}>
        Export Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

type ExportableAuditRow = Record<string, string | number | boolean | null | undefined>;

function formatUserName(log: AuditLog): string {
  if (!log.user) return "System";
  return `${log.user.firstName} ${log.user.lastName}`.trim();
}

function exportColumns() {
  return [
    { key: "timestamp", label: "Timestamp" },
    { key: "user", label: "User" },
    { key: "email", label: "Email" },
    { key: "action", label: "Action" },
    { key: "details", label: "Details" },
    { key: "ipAddress", label: "IP Address" },
  ];
}

function toExportableRow(log: AuditLog): ExportableAuditRow {
  return {
    timestamp: new Date(log.createdAt).toLocaleString(),
    user: formatUserName(log),
    email: log.user?.email ?? "",
    action: log.action.replaceAll("_", " "),
    details: log.details ?? "",
    ipAddress: log.ipAddress ?? "",
  };
}

function AuditLogExport() {
  const { data: exportData, isFetching: isExportFetching } = useAuditLogs({
    page: 1,
    limit: 10000,
  });
  const allLogs = exportData?.logs ?? [];
  const hasData = allLogs.length > 0;

  function handleExportCsv() {
    if (!hasData) return;
    const filename = `audit-logs-${new Date().toISOString().split("T")[0]}`;
    downloadCsv(filename, allLogs.map(toExportableRow), exportColumns());
  }

  function handleExportExcel() {
    if (!hasData) return;
    const filename = `audit-logs-${new Date().toISOString().split("T")[0]}`;
    downloadExcel(filename, allLogs.map(toExportableRow), exportColumns());
  }

  const exportDisabled = isExportFetching || !hasData;

  return (
    <ActionMenu
      trigger={
        <Button
          variant="outline"
          size="sm"
          disabled={exportDisabled}
          className="h-9 gap-1.5"
        >
          <Download className="size-4" />
          Export
        </Button>
      }
    >
      <ActionMenuItem
        icon={<Download className="size-4" />}
        onClick={handleExportCsv}
      >
        Export CSV
      </ActionMenuItem>
      <ActionMenuItem
        icon={<FileSpreadsheet className="size-4" />}
        onClick={handleExportExcel}
      >
        Export Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

export function AuditLogPage() {
  const { user, isHydrated, isAdminOrAbove } = useAuth();
  const hasAuditPermission = user?.permissions?.includes("audit:read") ?? false;
  const [tab, setTab] = useState<Tab>("changes");
  const [filters, setFilters] = useState<ChangeLogFilters>({});
  const [openChangeId, setOpenChangeId] = useState<string | null>(null);

  // A copied link (?change=<id>) opens that change.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("change");
    if (id && /^\d+$/.test(id)) setOpenChangeId(id);
  }, []);

  if (!isHydrated) return <div className="p-6"><div className="h-56 animate-pulse rounded-xl bg-muted" /></div>;
  if (!isAdminOrAbove && !hasAuditPermission) return <div className="p-6"><div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">You do not have permission to view the audit log.</div></div>;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Audit Log"
        description="Who changed which record and field, and every business event"
        actions={tab === "events" ? <AuditLogExport /> : tab === "changes" ? <ChangeLogExport filters={filters} /> : undefined}
      />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Audit log views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "changes" && <ChangeLogTable filters={filters} onFiltersChange={setFilters} onOpen={setOpenChangeId} />}
      {tab === "summary" && <ChangeLogSummary filters={filters} onFiltersChange={setFilters} />}
      {tab === "events" && (
        <>
          <AuditStatsCards />
          <AuditLogTable />
        </>
      )}
      <ChangeDetailModal changeId={openChangeId} onClose={() => setOpenChangeId(null)} />
    </div>
  );
}
