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
import { DELETE_ROLES } from "@/features/auth/roles";
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

export function AppointmentsTable() {
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);

  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canDelete = hasAccess(DELETE_ROLES);
  // SuperAdmin: null activeBranch = all branches; everyone else: locked to their branch
  const branchId = activeBranch?.id ?? undefined;

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id, statusFilter]);

  const { data, isLoading, isError, isFetching } = useAppointments({
    page,
    limit: PAGE_SIZE,
    status: statusFilter || undefined,
    branchId,
  });

  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const editingAppointment =
    data?.appointments?.find((a) => a.id === editingId) ?? null;

  function changeFilter(s: AppointmentStatus | "") {
    setStatusFilter(s);
    setPage(1);
  }

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
    <div className="grid gap-4">
      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => changeFilter("")}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
            statusFilter === ""
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
          )}
        >
          All
        </button>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => changeFilter(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              statusFilter === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
            )}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e8edf3] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e8edf3] bg-[#f8fafc]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Vehicle</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Branch</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Scheduled</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Notes</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows />
              ) : !data?.appointments?.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {statusFilter
                      ? `No appointments with status "${STATUS_LABELS[statusFilter]}"`
                      : "No appointments yet. Book one above."}
                  </td>
                </tr>
              ) : (
                data.appointments.map((appt) => (
                  <AppointmentRow
                    key={appt.id}
                    appointment={appt}
                    canDelete={canDelete}
                    onEdit={() => setEditingId(appt.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > PAGE_SIZE && (
          <div
            className={cn(
              "flex items-center justify-between border-t border-[#e8edf3] px-4 py-3",
              isFetching && "opacity-60",
            )}
          >
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
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
    </div>
  );
}

// ─── Row ───────────────────────────────────────────────────────────────────────

function AppointmentRow({
  appointment,
  canDelete,
  onEdit,
}: {
  appointment: Appointment;
  canDelete: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const customerName = appointment.customer
    ? `${appointment.customer.firstName} ${appointment.customer.lastName}`
    : "—";

  return (
    <tr
      className="cursor-pointer border-t border-border transition-colors hover:bg-muted/30"
      onClick={() => router.push(`/appointments/${appointment.id}`)}
    >
      <td className="px-4 py-3 font-medium">{customerName}</td>
      <td className="px-4 py-3 text-muted-foreground">
        {appointment.vehicle
          ? `${(appointment.vehicle as Record<string, unknown>).make ?? ""} ${(appointment.vehicle as Record<string, unknown>).model ?? ""}`
          : "—"}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {appointment.branch?.name ?? "—"}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {new Date(appointment.scheduledAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            STATUS_COLORS[appointment.status],
          )}
        >
          {STATUS_LABELS[appointment.status]}
        </span>
      </td>
      <td className="max-w-xs px-4 py-3 text-muted-foreground">
        <span className="line-clamp-1">
          {appointment.notes ?? <span className="text-border">—</span>}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label={`Edit appointment`}
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          {canDelete && <AppointmentDeleteButton appointment={appointment} />}
        </div>
      </td>
    </tr>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-border">
          {Array.from({ length: 6 }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            </td>
          ))}
          <td className="px-4 py-3" />
        </tr>
      ))}
    </>
  );
}
