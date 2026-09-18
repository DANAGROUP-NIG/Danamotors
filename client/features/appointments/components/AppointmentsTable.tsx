"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Download,
  Share2,
  Mail,
  MessageCircle,
  Link2,
  Trash2,
  Eye,
  FileSpreadsheet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ModalFame from "@/components/modals/ModalFame";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
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
  pluralize,
} from "@/lib/table-actions";
import { DateInput } from "@/components/forms/DateInput";
import { useAppointments } from "../hooks/use-appointments";
import { useBulkDeleteAppointments } from "../hooks/use-bulk-delete-appointments";
import { AppointmentEditForm } from "./AppointmentEditForm";
import type { Appointment, AppointmentStatus, AppointmentSource } from "../types/appointment.types";

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

const SOURCE_LABELS: Record<AppointmentSource, string> = {
  WalkIn: "Walk-in",
  OnlineBooking: "Online",
};

const SOURCE_COLORS: Record<AppointmentSource, string> = {
  WalkIn: "bg-amber-50 text-amber-700",
  OnlineBooking: "bg-blue-50 text-blue-700",
};

const SOURCE_OPTIONS = [
  { label: "All", value: "" },
  { label: "Walk-in", value: "WalkIn" },
  { label: "Online", value: "OnlineBooking" },
];

const ALL_STATUSES = Object.keys(STATUS_LABELS) as AppointmentStatus[];

const STATUS_OPTIONS = [{ label: "All", value: "" }, ...ALL_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: s }))];

function customerName(a: Appointment) {
  return a.customer ? `${a.customer.firstName} ${a.customer.lastName}` : "—";
}

function vehicleReg(a: Appointment) {
  const vehicle = a.vehicle as Record<string, unknown> | null | undefined;
  return vehicle?.registrationNumber ? String(vehicle.registrationNumber) : "—";
}

function scheduledLabel(a: Appointment) {
  return new Date(a.scheduledAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatAppointmentText(a: Appointment) {
  return `*Appointment: ${customerName(a)}*\nVehicle: ${vehicleReg(a)}\nBranch: ${a.branch?.name ?? "—"}\nScheduled: ${scheduledLabel(a)}\nStatus: ${STATUS_LABELS[a.status]}\nSource: ${SOURCE_LABELS[a.source]}\nNotes: ${a.notes ?? "—"}`;
}

function toExportRow(a: Appointment): Record<string, string | number | boolean | null | undefined> {
  return {
    customer: customerName(a),
    vehicleRegNo: vehicleReg(a),
    branch: a.branch?.name ?? "",
    scheduledAt: scheduledLabel(a),
    status: STATUS_LABELS[a.status],
    source: SOURCE_LABELS[a.source],
    notes: a.notes ?? "",
    agent: a.createdBy ? `${a.createdBy.firstName} ${a.createdBy.lastName}` : "",
  };
}

function exportColumns() {
  return [
    { key: "customer", label: "Customer" },
    { key: "vehicleRegNo", label: "Vehicle Reg No" },
    { key: "branch", label: "Branch" },
    { key: "scheduledAt", label: "Scheduled" },
    { key: "status", label: "Status" },
    { key: "source", label: "Source" },
    { key: "notes", label: "Notes" },
    { key: "agent", label: "Agent" },
  ];
}

export function AppointmentsTable() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deleteCandidates, setDeleteCandidates] = useState<Appointment[] | null>(null);

  const router = useRouter();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasPermission } = useAuth();
  const canDelete = hasPermission("appointment:delete");
  const canEdit = hasPermission("appointment:update");
  const branchId = activeBranch?.id ?? undefined;

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id, statusFilter, sourceFilter, dateFrom, dateTo]);

  const { data, isLoading, isError, isFetching } = useAppointments({
    page,
    limit: PAGE_SIZE,
    status: statusFilter || undefined,
    source: sourceFilter || undefined,
    search: debouncedSearch || undefined,
    branchId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const appointments = data?.appointments ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selection = useDataTableSelection<Appointment>({
    data: appointments,
    rowKey: (a) => a.id,
  });

  const bulkDelete = useBulkDeleteAppointments();

  const editingAppointment =
    appointments.find((a) => a.id === editingId) ?? null;

  function changeSourceFilter(s: string) {
    setSourceFilter(s);
    setPage(1);
  }

  function changeFilter(s: string) {
    setStatusFilter(s);
    setPage(1);
  }

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

  function exportSelected(items: Appointment[]) {
    downloadCsv(
      `appointments-${new Date().toISOString().split("T")[0]}`,
      items.map(toExportRow),
      exportColumns(),
    );
  }

  function exportSelectedExcel(items: Appointment[]) {
    downloadExcel(
      `appointments-${new Date().toISOString().split("T")[0]}`,
      items.map(toExportRow),
      exportColumns(),
    );
  }

  function shareSelected(items: Appointment[]) {
    const text = items.map(formatAppointmentText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Dana Motors Appointments`,
      text,
    });
  }

  function emailSelected(items: Appointment[]) {
    const body = items.map(formatAppointmentText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} Appointment${items.length === 1 ? "" : "s"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: Appointment[]) {
    const message = items.map(formatAppointmentText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  function confirmDeleteSelected(items: Appointment[]) {
    setDeleteCandidates(items);
  }

  function handleConfirmDelete() {
    if (!deleteCandidates) return;
    bulkDelete.mutate(deleteCandidates, {
      onSuccess: () => {
        setDeleteCandidates(null);
        selection.clear();
      },
    });
  }

  const columns: Column<Appointment>[] = [
    {
      header: "Customer",
      render: (a) => (
        <span className="font-medium">{customerName(a)}</span>
      ),
    },
    {
      header: "Vehicle Reg No",
      render: (a) => (
        <span className="text-muted-foreground">{vehicleReg(a)}</span>
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
        <span className="text-muted-foreground">{scheduledLabel(a)}</span>
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
      header: "Source",
      className: "whitespace-nowrap",
      render: (a) => (
        <span
          className={cn(
            "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
            SOURCE_COLORS[a.source],
          )}
        >
          {SOURCE_LABELS[a.source]}
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
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (a) => (
        <DataTableRowActions
          item={a}
          quickActions={[
            canEdit && {
              id: "edit",
              label: "Edit",
              icon: <Pencil className="size-3.5" />,
              onClick: () => setEditingId(a.id),
            },
          ]}
          actions={[
            {
              id: "view",
              label: "View details",
              icon: <Eye className="size-4" />,
              onClick: () => router.push(`/appointments/${a.id}`),
            },
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([a]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: `Appointment: ${customerName(a)}`,
                  text: formatAppointmentText(a),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Appointment: ${customerName(a)}`,
                  body: formatAppointmentText(a),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatAppointmentText(a) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              shortcut: "⌘C",
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/appointments/${a.id}`,
                  "Appointment link copied",
                ),
            },
            canDelete && {
              id: "delete",
              label: "Delete",
              icon: <Trash2 className="size-4" />,
              destructive: true,
              onClick: () => setDeleteCandidates([a]),
            },
          ]}
        />
      ),
    },
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
        data={appointments}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          statusFilter
            ? `No appointments with status "${STATUS_LABELS[statusFilter as AppointmentStatus] ?? statusFilter}"`
            : "No appointments yet. Book one above."
        }
        rowKey={(a) => a.id}
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
            onSearch={commitSearch}
            onClearSearch={clearSearch}
            placeholder="Search by customer, vehicle, or job…"
            filters={
              <>
                <div className="flex items-center gap-2">
                  <DateInput
                    value={dateFrom}
                    onChange={(v) => {
                      setDateFrom(v);
                      setPage(1);
                    }}
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <DateInput
                    value={dateTo}
                    onChange={(v) => {
                      setDateTo(v);
                      setPage(1);
                    }}
                  />
                </div>
                <DataTableFilterChips options={STATUS_OPTIONS} selected={statusFilter} onChange={changeFilter} />
                <DataTableFilterChips options={SOURCE_OPTIONS} selected={sourceFilter} onChange={changeSourceFilter} />
              </>
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
              canDelete && {
                id: "delete",
                label: "Delete",
                icon: <Trash2 className="size-3.5" />,
                variant: "destructive",
                onClick: confirmDeleteSelected,
              },
            ]}
          />
        </div>
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

      <ConfirmDeleteModal
        isOpen={!!deleteCandidates}
        onClose={() => setDeleteCandidates(null)}
        onConfirm={handleConfirmDelete}
        title={
          deleteCandidates && deleteCandidates.length > 1
            ? `Delete ${pluralize(deleteCandidates.length, "appointment")}?`
            : "Delete appointment?"
        }
        message={
          deleteCandidates && deleteCandidates.length > 1
            ? `This will permanently remove ${pluralize(deleteCandidates.length, "appointment")}. This cannot be undone.`
            : "Are you sure you want to delete this appointment? This action cannot be undone."
        }
        isPending={bulkDelete.isPending}
      />
    </>
  );
}
