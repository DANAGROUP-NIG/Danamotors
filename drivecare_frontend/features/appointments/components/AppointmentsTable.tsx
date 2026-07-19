"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAppointments } from "../hooks/use-appointments";
import { AppointmentDeleteButton } from "./AppointmentDeleteButton";
import { AppointmentEditForm } from "./AppointmentEditForm";
import type { Appointment, AppointmentStatus } from "../types/appointment.types";

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  booked: "Booked",
  checked_in: "Checked In",
  inspection: "Inspection",
  awaiting_approval: "Awaiting Approval",
  in_repair: "In Repair",
  quality_check: "Quality Check",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  booked: "bg-blue-50 text-blue-700",
  checked_in: "bg-sky-50 text-sky-700",
  inspection: "bg-violet-50 text-violet-700",
  awaiting_approval: "bg-amber-50 text-amber-700",
  in_repair: "bg-orange-50 text-orange-700",
  quality_check: "bg-indigo-50 text-indigo-700",
  ready: "bg-emerald-50 text-emerald-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-600",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS) as AppointmentStatus[];

export function AppointmentsTable() {
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading, isError, isFetching } = useAppointments({
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter || undefined,
  });
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  function changeFilter(s: AppointmentStatus | "") { setStatusFilter(s); setPage(1); }

  if (isError) {
    return (
      <Card><CardContent className="py-12 text-center">
        <p className="text-sm text-red-500">Failed to load appointments. Check the API connection and try again.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => changeFilter("")}
          className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
            statusFilter === "" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
          )}
        >
          All
        </button>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => changeFilter(s)}
            className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              statusFilter === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Service</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Scheduled</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Notes</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows />
              ) : !data?.items.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {statusFilter ? `No appointments with status "${STATUS_LABELS[statusFilter]}"` : "No appointments yet. Book one above."}
                  </td>
                </tr>
              ) : (
                data.items.map((appt) => (
                  <AppointmentRow
                    key={appt.id}
                    appointment={appt}
                    isEditing={editingId === appt.id}
                    onEdit={() => setEditingId((prev) => prev === appt.id ? null : appt.id)}
                    onEditSuccess={() => setEditingId(null)}
                    onEditCancel={() => setEditingId(null)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > PAGE_SIZE && (
          <div className={cn("flex items-center justify-between border-t border-[#e8edf3] px-4 py-3", isFetching && "opacity-60")}>
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AppointmentRow({ appointment, isEditing, onEdit, onEditSuccess, onEditCancel }: {
  appointment: Appointment; isEditing: boolean;
  onEdit: () => void; onEditSuccess: () => void; onEditCancel: () => void;
}) {
  return (
    <>
      <tr className={cn("border-t border-border transition-colors", isEditing ? "bg-muted/50" : "hover:bg-muted/30")}>
        <td className="px-4 py-3 font-medium">{appointment.serviceType}</td>
        <td className="px-4 py-3 text-muted-foreground">
          {new Date(appointment.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </td>
        <td className="px-4 py-3">
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_COLORS[appointment.status])}>
            {STATUS_LABELS[appointment.status]}
          </span>
        </td>
        <td className="max-w-xs px-4 py-3 text-muted-foreground">
          <span className="line-clamp-1">{appointment.notes ?? <span className="text-border">—</span>}</span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm" variant="ghost"
              className={cn("h-7 w-7 p-0", isEditing ? "text-primary" : "text-muted-foreground hover:text-foreground")}
              aria-label={`Edit appointment ${appointment.id}`}
              onClick={onEdit}
            >
              <Pencil className="size-3.5" />
            </Button>
            <AppointmentDeleteButton appointment={appointment} />
          </div>
        </td>
      </tr>
      {isEditing && (
        <tr className="border-t border-border bg-muted/30">
          <td colSpan={5} className="px-4 py-4">
            <AppointmentEditForm appointment={appointment} onSuccess={onEditSuccess} onCancel={onEditCancel} />
          </td>
        </tr>
      )}
    </>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-border">
          {Array.from({ length: 4 }).map((__, j) => (
            <td key={j} className="px-4 py-3"><div className="h-4 w-28 animate-pulse rounded bg-muted" /></td>
          ))}
          <td className="px-4 py-3" />
        </tr>
      ))}
    </>
  );
}
