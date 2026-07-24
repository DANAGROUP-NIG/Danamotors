"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, CalendarClock, CheckCircle, XCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useAppointment } from "@/features/appointments";
import { useUpdateAppointment } from "@/features/appointments/hooks/use-update-appointment";
import ModalFame from "@/components/modals/ModalFame";
import { AppointmentEditForm } from "@/features/appointments/components/AppointmentEditForm";

const STATUS_COLORS: Record<string, string> = {
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

const RECEPTIONIST_ACTIONABLE_STATUSES = ["Pending", "Checked In"];

export default function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useAppointment(id);
  const { isReceptionist } = useAuth();
  const update = useUpdateAppointment(id);
  const [showEdit, setShowEdit] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const appointment = data?.appointment;

  if (error || !appointment) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/appointments" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Appointments
        </Link>
        <p className="text-sm text-red-500">Appointment not found.</p>
      </div>
    );
  }

  const vehicle = appointment.vehicle as Record<string, unknown> | undefined;
  const vehicleLabel = vehicle
    ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() || "—"
    : "—";

  const canTakeAction = isReceptionist && RECEPTIONIST_ACTIONABLE_STATUSES.includes(appointment.status);

  function handleCheckIn() {
    update.mutate({ status: "Checked In" });
  }

  function handleCancel() {
    if (!confirm("Are you sure you want to cancel this appointment?")) return;
    update.mutate({ status: "Cancelled" });
  }

  return (
    <div className="px-4 py-6 lg:px-6">
      <Link href="/appointments" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Appointments
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Appointment</h1>
            <p className="mt-1 text-sm text-slate-500">
              {new Date(appointment.scheduledAt).toLocaleString(undefined, {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[appointment.status] ?? "bg-slate-100 text-slate-600"}`}>
            {appointment.status}
          </span>
        </div>

        {/* ── Receptionist action buttons ───────────────────────────── */}
        {canTakeAction && (
          <div className="mb-6 flex flex-wrap gap-2">
            {appointment.status === "Pending" && (
              <Button
                size="sm"
                onClick={handleCheckIn}
                disabled={update.isPending}
                className="gap-1.5"
              >
                <CheckCircle className="size-4" />
                Check In
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowEdit(true)}
              className="gap-1.5"
            >
              <CalendarClock className="size-4" />
              Reschedule
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={update.isPending}
              className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <XCircle className="size-4" />
              Cancel
            </Button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField
            label="Customer"
            value={
              appointment.customer
                ? `${appointment.customer.firstName} ${appointment.customer.lastName}`
                : null
            }
          />
          <DetailField label="Customer Email" value={appointment.customer?.email} />
          <DetailField label="Vehicle" value={vehicleLabel} />
          {typeof vehicle?.vin === "string" && <DetailField label="VIN" value={vehicle.vin} />}
          <DetailField label="Branch" value={appointment.branch?.name} />
          <DetailField
            label="Duration"
            value={appointment.durationMins ? `${appointment.durationMins} mins` : null}
          />
          <DetailField label="Notes" value={appointment.notes} />
          <DetailField
            label="Created By"
            value={
              appointment.createdBy
                ? `${appointment.createdBy.firstName} ${appointment.createdBy.lastName}`
                : null
            }
          />
          <DetailField
            label="Created At"
            value={new Date(appointment.createdAt).toLocaleDateString()}
          />
        </div>

        {Array.isArray(appointment.jobCards) && appointment.jobCards.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-6">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Linked Job Cards</h2>
            <div className="space-y-2">
              {(appointment.jobCards as Record<string, unknown>[]).map((jc) => (
                <Link
                  key={jc.id as string}
                  href={`/job-cards/${jc.id}`}
                  className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm transition-colors hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-800">{jc.jobNumber as string}</span>
                  <span className="text-slate-400">—</span>
                  <span className="text-slate-500">{jc.status as string}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Reschedule modal ──────────────────────────────────────── */}
      <ModalFame isOpen={showEdit} onClose={() => setShowEdit(false)} title="Reschedule appointment">
        <AppointmentEditForm
          appointment={appointment}
          onSuccess={() => setShowEdit(false)}
        />
      </ModalFame>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-700">{value ?? "—"}</p>
    </div>
  );
}
