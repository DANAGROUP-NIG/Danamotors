"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DateInput } from "@/components/forms/DateInput";
import { cn } from "@/lib/utils";
import { useUsers } from "@/features/users/hooks/use-users";
import { useAuditLogs } from "../hooks/use-audit-logs";
import type { AuditLog } from "../types/audit.types";
import { AuditLogDetailModal } from "./AuditLogDetailModal";

const PAGE_SIZE = 20;
const selectClass = "h-10 min-w-36 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const ACTION_TYPES = [
  "LOGIN",
  "LOGOUT",
  "PASSWORD_RESET",
  "USER_CREATE",
  "USER_UPDATE",
  "USER_DELETE",
  "ROLE_CREATE",
  "ROLE_UPDATE",
  "ROLE_DELETE",
  "BRANCH_CREATE",
  "BRANCH_UPDATE",
  "BRANCH_DELETE",
  "APPOINTMENT_CREATE",
  "APPOINTMENT_UPDATE",
  "APPOINTMENT_DELETE",
  "SERVICE_CREATE",
  "SERVICE_UPDATE",
  "SERVICE_DELETE",
  "VEHICLE_CREATE",
  "VEHICLE_UPDATE",
  "VEHICLE_DELETE",
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

  useEffect(() => setPage(1), [action, userId, dateFrom, dateTo]);
  useEffect(() => {
    const totalPages = data?.meta.totalPages ?? 1;
    if (page > totalPages) setPage(totalPages);
  }, [data?.meta.totalPages, page]);
  const columns: Column<AuditLog>[] = [
    { header: "Timestamp", className: "whitespace-nowrap", render: (log) => <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }).replace(",", " ·")}</span> },
    { header: "User", render: (log) => log.user ? <div><p className="font-medium">{log.user.firstName} {log.user.lastName}</p><p className="text-xs text-muted-foreground">{log.user.email}</p></div> : <span className="font-medium">System</span> },
    { header: "Action", className: "whitespace-nowrap", render: (log) => <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", actionColor(log.action))}>{log.action.replaceAll("_", " ")}</span> },
    { header: "Details", render: (log) => <span className="block max-w-sm truncate text-muted-foreground" title={log.details ?? ""}>{log.details || "—"}</span> },
    { header: "IP Address", className: "whitespace-nowrap font-mono text-xs text-muted-foreground", render: (log) => log.ipAddress || "—" },
  ];

  if (isError) return <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">Failed to load audit logs. Check the API connection and try again.</div>;
  return <>
    <DataTable columns={columns} data={data?.logs ?? []} isLoading={isLoading} isFetching={isFetching} rowKey={(log) => log.id} onRowClick={(log) => setSelectedId(log.id)} emptyMessage="No audit entries match these filters." page={page} pageSize={PAGE_SIZE} total={data?.meta.total ?? 0} totalPages={data?.meta.totalPages ?? 1} onPageChange={setPage}>
      <DataTableToolbar search={search} onSearchChange={setSearch} onSearch={() => { setCommittedSearch(search); setPage(1); }} onClearSearch={() => { setSearch(""); setCommittedSearch(""); setPage(1); }} placeholder="Search by action or details…" filters={<div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">From <DateInput value={dateFrom} onChange={setDateFrom} /></label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">To <DateInput value={dateTo} onChange={setDateTo} /></label>
        <select aria-label="Action type" className={selectClass} value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{ACTION_TYPES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
        <select aria-label="User" className={selectClass} value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">All users</option>{usersData?.users.map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>)}</select>
      </div>} />
    </DataTable>
    <AuditLogDetailModal logId={selectedId} onClose={() => setSelectedId(null)} />
  </>;
}
