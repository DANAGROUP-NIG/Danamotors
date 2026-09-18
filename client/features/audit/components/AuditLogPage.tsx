"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useAuditLogs } from "@/features/audit/hooks/use-audit-logs";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";
import type { AuditLog } from "@/features/audit/types/audit.types";
import { AuditLogTable } from "./AuditLogTable";
import { AuditStatsCards } from "./AuditStatsCards";

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

  if (!isHydrated) return <div className="p-6"><div className="h-56 animate-pulse rounded-xl bg-muted" /></div>;
  if (!isAdminOrAbove && !hasAuditPermission) return <div className="p-6"><div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">You do not have permission to view the audit log.</div></div>;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Audit Log"
        description="Review a history of system actions and changes"
        actions={<AuditLogExport />}
      />
      <AuditStatsCards />
      <AuditLogTable />
    </div>
  );
}
