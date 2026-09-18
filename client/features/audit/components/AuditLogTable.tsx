"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Share2,
  Mail,
  MessageCircle,
  Link2,
  FileSpreadsheet,
} from "lucide-react";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import {
  downloadCsv,
  downloadExcel,
  shareItems,
  openMailto,
  openWhatsApp,
  copyToClipboard,
} from "@/lib/table-actions";
import { DateInput } from "@/components/forms/DateInput";
import { cn } from "@/lib/utils";
import { useUsers } from "@/features/users/hooks/use-users";
import { useAuditLogs } from "../hooks/use-audit-logs";
import type { AuditLog } from "../types/audit.types";
import { AuditLogDetailModal } from "./AuditLogDetailModal";

const PAGE_SIZE = 20;
const selectClass = "h-10 min-w-36 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const ACTION_TYPES = [
  "USER_REGISTERED",
  "USER_LOGIN",
  "USER_LOGOUT",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "USER_PROFILE_UPDATED",
];

export const ACTION_COLORS: Record<string, string> = {
  LOGIN: "bg-blue-50 text-blue-700", LOGOUT: "bg-blue-50 text-blue-700",
  USER_CREATE: "bg-purple-50 text-purple-700", USER_UPDATE: "bg-purple-50 text-purple-700", ROLE_CREATE: "bg-purple-50 text-purple-700", ROLE_UPDATE: "bg-purple-50 text-purple-700",
  APPOINTMENT_CREATE: "bg-green-50 text-green-700", APPOINTMENT_UPDATE: "bg-green-50 text-green-700", APPOINTMENT_DELETE: "bg-red-50 text-red-700",
};

function actionColor(action: string) {
  if (ACTION_COLORS[action]) return ACTION_COLORS[action];
  if (action.includes("DELETE")) return "bg-red-50 text-red-700";
  if (/LOGIN|LOGOUT|PASSWORD|AUTH/.test(action)) return "bg-blue-50 text-blue-700";
  if (/USER|ROLE|BRANCH/.test(action)) return "bg-purple-50 text-purple-700";
  if (/APPOINTMENT|SERVICE|JOB|VEHICLE/.test(action)) return "bg-green-50 text-green-700";
  return "bg-slate-100 text-slate-700";
}

function formatUserName(log: AuditLog): string {
  if (!log.user) return "System";
  return `${log.user.firstName} ${log.user.lastName}`.trim();
}

function formatAuditText(log: AuditLog): string {
  const lines = [
    `*${log.action.replaceAll("_", " ")}*`,
    `User: ${formatUserName(log)}`,
    `Time: ${new Date(log.createdAt).toLocaleString()}`,
  ];
  if (log.details) lines.push(`Details: ${log.details}`);
  if (log.ipAddress) lines.push(`IP: ${log.ipAddress}`);
  return lines.join("\n");
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

function toExportableRow(log: AuditLog) {
  return {
    timestamp: new Date(log.createdAt).toLocaleString(),
    user: formatUserName(log),
    email: log.user?.email ?? "",
    action: log.action.replaceAll("_", " "),
    details: log.details ?? "",
    ipAddress: log.ipAddress ?? "",
  };
}

export function AuditLogTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [action, setAction] = useState("");
  const [userId, setUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const params = useMemo(() => ({ page, limit: PAGE_SIZE, search: committedSearch || undefined, action: action || undefined, userId: userId || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }), [page, committedSearch, action, userId, dateFrom, dateTo]);
  const { data, isLoading, isFetching, isError } = useAuditLogs(params);
  const { data: usersData } = useUsers({ page: 1, limit: 100 });

  const logs = useMemo(() => data?.logs ?? [], [data?.logs]);
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;

  const selection = useDataTableSelection<AuditLog>({
    data: logs,
    rowKey: (log) => log.id,
  });

  useEffect(() => setPage(1), [action, userId, dateFrom, dateTo]);
  useEffect(() => {
    const currentTotalPages = data?.meta.totalPages ?? 1;
    if (page > currentTotalPages) setPage(currentTotalPages);
  }, [data?.meta.totalPages, page]);

  function exportSelected(items: AuditLog[]) {
    const filename = `audit-logs-${new Date().toISOString().split("T")[0]}`;
    downloadCsv(
      filename,
      items.map(toExportableRow),
      exportColumns(),
    );
  }

  function exportSelectedExcel(items: AuditLog[]) {
    const filename = `audit-logs-${new Date().toISOString().split("T")[0]}`;
    downloadExcel(
      filename,
      items.map(toExportableRow),
      exportColumns(),
    );
  }

  function shareSelected(items: AuditLog[]) {
    const text = items.map(formatAuditText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Audit Log${items.length === 1 ? "" : "s"}`,
      text,
    });
  }

  function emailSelected(items: AuditLog[]) {
    const body = items.map(formatAuditText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} Audit Log${items.length === 1 ? "" : "s"}`,
      body,
    });
  }

  function whatsappSelected(items: AuditLog[]) {
    const message = items.map(formatAuditText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  const columns: Column<AuditLog>[] = [
    { header: "Timestamp", className: "whitespace-nowrap", render: (log) => <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }).replace(",", " ·")}</span> },
    { header: "User", render: (log) => log.user ? <div><p className="font-medium">{log.user.firstName} {log.user.lastName}</p><p className="text-xs text-muted-foreground">{log.user.email}</p></div> : <span className="font-medium">System</span> },
    { header: "Action", className: "whitespace-nowrap", render: (log) => <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", actionColor(log.action))}>{log.action.replaceAll("_", " ")}</span> },
    { header: "Details", render: (log) => <span className="block max-w-sm truncate text-muted-foreground" title={log.details ?? ""}>{log.details || "—"}</span> },
    { header: "IP Address", className: "whitespace-nowrap font-mono text-xs text-muted-foreground", render: (log) => log.ipAddress || "—" },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (log) => (
        <DataTableRowActions
          item={log}
          actions={[
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([log]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: `Audit Log: ${log.action.replaceAll("_", " ")}`,
                  text: formatAuditText(log),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Audit Log: ${log.action.replaceAll("_", " ")}`,
                  body: formatAuditText(log),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatAuditText(log) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              onClick: () =>
                copyToClipboard(
                  `${window.location.href.split("?")[0]}?log=${log.id}`,
                  "Audit log link copied",
                ),
            },
          ]}
        />
      ),
    },
  ];

  if (isError) return <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">Failed to load audit logs. Check the API connection and try again.</div>;
  return (
    <>
      <DataTable
        columns={columns}
        data={logs}
        isLoading={isLoading}
        isFetching={isFetching}
        rowKey={(log) => log.id}
        emptyMessage="No audit entries match these filters."
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
        selection={selection}
      >
        <div className="flex flex-col gap-4">
          <DataTableToolbar
            search={search}
            onSearchChange={setSearch}
            onSearch={() => { setCommittedSearch(search); setPage(1); }}
            onClearSearch={() => { setSearch(""); setCommittedSearch(""); setPage(1); }}
            placeholder="Search by action or details…"
            isLoading={isLoading}
            isFetching={isFetching}
            filters={
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">From <DateInput value={dateFrom} onChange={setDateFrom} /></label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">To <DateInput value={dateTo} onChange={setDateTo} /></label>
                <select aria-label="Action type" className={selectClass} value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{ACTION_TYPES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
                <select aria-label="User" className={selectClass} value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">All users</option>{usersData?.users.map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>)}</select>
              </div>
            }
          />

          <DataTableBulkToolbar
            selectedCount={selection.selectedIds.size}
            totalCount={total}
            selectedItems={selection.selectedItems}
            onClear={selection.clear}
            actions={[
              {
                id: "export",
                label: "CSV",
                icon: <Download className="size-3.5" />,
                variant: "ghost",
                onClick: exportSelected,
              },
              {
                id: "excel",
                label: "Excel",
                icon: <FileSpreadsheet className="size-3.5" />,
                variant: "ghost",
                onClick: exportSelectedExcel,
              },
              {
                id: "share",
                label: "Share",
                icon: <Share2 className="size-3.5" />,
                variant: "ghost",
                onClick: shareSelected,
              },
              {
                id: "email",
                label: "Email",
                icon: <Mail className="size-3.5" />,
                variant: "ghost",
                onClick: emailSelected,
              },
              {
                id: "whatsapp",
                label: "WhatsApp",
                icon: <MessageCircle className="size-3.5" />,
                variant: "ghost",
                onClick: whatsappSelected,
              },
            ]}
          />
        </div>
      </DataTable>

      <AuditLogDetailModal logId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
