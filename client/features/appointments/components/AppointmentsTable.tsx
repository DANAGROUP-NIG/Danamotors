"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ModalFame from "@/components/modals/ModalFame";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DELETE_ROLES, SERVICE_UPDATE_ROLES } from "@/features/auth/roles";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { useAppointments } from "../hooks/use-appointments";
import { AppointmentEditForm } from "./AppointmentEditForm";
import { AppointmentDeleteButton } from "./AppointmentDeleteButton";
import type { Appointment, AppointmentStatus } from "../types/appointment.types";

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  Pending: "Pending",
  "Checked In": "Checked In",
  Inspection: "Inspection",
  "Awaiting Approval": "Awaiting Approval",
  "In Repair": "In Repair",
  "Quality Check": "Quality Check",
  Ready: "Ready",
  Completed: "Completed",
  Cancelled: "Cancelled",
};

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  Pending: "bg-slate-100 text-slate-700",
  "Checked In": "bg-sky-50 text-sky-700",
  Inspection: "bg-violet-50 text-violet-700",
  "Awaiting Approval": "bg-amber-50 text-amber-700",
  "In Repair": "bg-orange-50 text-orange-700",
  "Quality Check": "bg-indigo-50 text-indigo-700",
  Ready: "bg-emerald-50 text-emerald-700",
  Completed: "bg-green-50 text-green-700",
  Cancelled: "bg-red-50 text-red-600",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS) as AppointmentStatus[];

const STATUS_OPTIONS = [{ label: "All", value: "" }, ...ALL_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: s }))];

export function AppointmentsTable() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const router = useRouter();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canDelete = hasAccess(DELETE_ROLES);
  const canEdit = hasAccess(SERVICE_UPDATE_ROLES);
  const canManage = canEdit || canDelete;
  const branchId = activeBranch?.id ?? undefined;

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id, statusFilter, dateFrom, dateTo]);

  const { data, isLoading, isError, isFetching } = useAppointments({
    page,
    limit: PAGE_SIZE,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
    branchId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const editingAppointment =
    data?.appointments?.find((a) => a.id === editingId) ?? null;

  function changeFilter(s: string) {
    setStatusFilter(s);
    setPage(1);
  }

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

  const columns: Column<Appointment>[] = [
    {
      header: "Customer",
      render: (a) => {
        const name = a.customer
          ? `${a.customer.firstName} ${a.customer.lastName}`
          : "—";
        return <span className="font-medium">{name}</span>;
      },
    },
    {
      header: "Vehicle Reg No",
      render: (a) => (
        <span className="text-muted-foreground">
          {(a.vehicle as Record<string, unknown> | null | undefined)?.registrationNumber
            ? String((a.vehicle as Record<string, unknown>).registrationNumber)
            : "—"}
        </span>
      ),
    },
    {
      header: "Branch",
      render: (a) => (
        <span className="text-muted-foreground">{a.branch?.name ?? "—"}</span>
      ),
    },
    {
      header: "Scheduled",
      render: (a) => (
        <span className="text-muted-foreground">
          {new Date(a.scheduledAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      ),
    },
    {
      header: "Status",
      render: (a) => (
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            STATUS_COLORS[a.status],
          )}
        >
          {STATUS_LABELS[a.status]}
        </span>
      ),
    },
    {
      header: "Notes",
      render: (a) => (
        <span className="max-w-xs text-muted-foreground">
          <span className="line-clamp-1">
            {a.notes ?? <span className="text-border">—</span>}
          </span>
        </span>
      ),
    },
    {
      header: "Agent",
      render: (a) => (
        <span className="text-muted-foreground">
          {a.createdBy ? a.createdBy.firstName : <span className="text-border">—</span>}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            header: "Actions",
            headerClassName: "text-right",
            render: (a: Appointment) => (
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    aria-label="Edit appointment"
                    onClick={() => setEditingId(a.id)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {canDelete && <AppointmentDeleteButton appointment={a} />}
              </div>
            ),
          },
        ]
      : []),
  ];

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-red-500">
            Failed to load appointments. Check the API connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={data?.appointments ?? []}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          statusFilter
            ? `No appointments with status "${STATUS_LABELS[statusFilter as AppointmentStatus] ?? statusFilter}"`
            : "No appointments yet. Book one above."
        }
        rowKey={(a) => a.id}
        onRowClick={(a) => router.push(`/appointments/${a.id}`)}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
      >
        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          onSearch={commitSearch}
          onClearSearch={clearSearch}
          placeholder="Search by customer, vehicle, or job…"
          filters={
            <>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <DataTableFilterChips options={STATUS_OPTIONS} selected={statusFilter} onChange={changeFilter} />
            </>
          }
        />
      </DataTable>

      <ModalFame
        isOpen={!!editingId}
        onClose={() => setEditingId(null)}
        title="Edit appointment"
      >
        {editingAppointment && (
          <AppointmentEditForm
            appointment={editingAppointment}
            onSuccess={() => setEditingId(null)}
          />
        )}
      </ModalFame>
    </>
  );
}
