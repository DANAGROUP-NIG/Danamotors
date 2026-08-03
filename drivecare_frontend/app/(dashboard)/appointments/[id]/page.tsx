"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  Pencil,
  Trash2,
  Wrench,
  User,
  Car,
  Building2,
  Clock,
  FileText,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DELETE_ROLES, SERVICE_UPDATE_ROLES, APPOINTMENT_UPDATE_ROLES } from "@/features/auth/roles";
import { useAppointment } from "@/features/appointments";
import { useUpdateAppointment } from "@/features/appointments/hooks/use-update-appointment";
import { useDeleteAppointment } from "@/features/appointments/hooks/use-delete-appointment";
import ModalFame from "@/components/modals/ModalFame";
import { AppointmentEditForm } from "@/features/appointments/components/AppointmentEditForm";
import { JobCardCreateForm } from "@/features/job-cards/components/JobCardCreateForm";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import type { AppRole } from "@/features/auth/roles";
import type { Appointment } from "@/features/appointments/types/appointment.types";

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

const STATUS_ORDER = [
  "Pending",
  "Checked In",
  "Inspection",
  "Awaiting Approval",
  "In Repair",
  "Quality Check",
  "Ready",
  "Completed",
];

const NEXT_STATUS: Record<string, string | null> = {
  Pending: "Checked In",
  "Checked In": "Inspection",
  Inspection: "Awaiting Approval",
  "Awaiting Approval": "In Repair",
  "In Repair": "Quality Check",
  "Quality Check": "Ready",
  Ready: "Completed",
  Completed: null,
  Cancelled: null,
};

const STATUS_TRANSITION_ROLES: Record<string, AppRole[]> = {
  "Checked In": ["superadmin", "admin", "receptionmanager"],
  Inspection: ["serviceadviser", "superadmin", "admin", "workshopmanager"],
  "Awaiting Approval": ["technician", "serviceadviser", "superadmin", "admin", "workshopmanager"],
  "In Repair": ["serviceadviser", "superadmin", "admin", "workshopmanager"],
  "Quality Check": ["technician", "serviceadviser", "superadmin", "admin", "workshopmanager"],
  Ready: ["workshopmanager", "serviceadviser", "superadmin", "admin"],
  Completed: ["serviceadviser", "superadmin", "admin", "receptionmanager"],
};

const CANCEL_ROLES: AppRole[] = ["superadmin", "admin", "receptionmanager"];

export default function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useAppointment(id);
  const { hasAccess } = useAuth();
  const update = useUpdateAppointment(id);
  const del = useDeleteAppointment();

  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showJobCardCreate, setShowJobCardCreate] = useState(false);

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
  const customer = appointment.customer;
  const branch = appointment.branch as Record<string, unknown> | undefined;

  const nextStatus = NEXT_STATUS[appointment.status];
  const canTransition = nextStatus && hasAccess(STATUS_TRANSITION_ROLES[nextStatus] ?? []);
  const canCancel = hasAccess(CANCEL_ROLES) && appointment.status !== "Completed" && appointment.status !== "Cancelled";
  const canEdit = hasAccess(APPOINTMENT_UPDATE_ROLES);
  const canDelete = hasAccess(DELETE_ROLES);
  const canCreateJobCard = hasAccess(SERVICE_UPDATE_ROLES) && appointment.status !== "Cancelled";

  const isTerminal = appointment.status === "Completed" || appointment.status === "Cancelled";

  function handleStatusTransition() {
    if (!nextStatus) return;
    update.mutate({ status: nextStatus as Appointment["status"] });
  }

  function handleCancel() {
    if (!confirm("Are you sure you want to cancel this appointment?")) return;
    update.mutate({ status: "Cancelled" });
  }

  function statusProgress(status: string) {
    const idx = STATUS_ORDER.indexOf(status);
    if (idx === -1) return null;
    return Math.round((idx / (STATUS_ORDER.length - 1)) * 100);
  }

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <Link href="/appointments" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Appointments
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
              Appointment
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {new Date(appointment.scheduledAt).toLocaleString(undefined, {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[appointment.status] ?? "bg-slate-100 text-slate-600"}`}>
            {appointment.status}
          </span>
        </div>

        {!isTerminal && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Pending</span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all"
                  style={{ width: `${statusProgress(appointment.status)}%` }}
                />
              </div>
              <span>Completed</span>
            </div>
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-2">
          {canTransition && (
            <Button size="sm" onClick={handleStatusTransition} disabled={update.isPending} className="gap-1.5">
              <CheckCircle className="size-4" />
              Mark as {nextStatus}
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setShowEdit(true)} className="gap-1.5">
              <Pencil className="size-4" />
              {!canTransition ? "Edit" : "Reschedule"}
            </Button>
          )}
          {canCreateJobCard && (
            <Button size="sm" variant="outline" onClick={() => setShowJobCardCreate(true)} className="gap-1.5">
              <Wrench className="size-4" />
              Create Job Card
            </Button>
          )}
          {canCancel && (
            <Button size="sm" variant="outline" onClick={handleCancel} disabled={update.isPending} className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700">
              <XCircle className="size-4" />
              Cancel
            </Button>
          )}
        </div>

        {update.isPending && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">
            <Loader2 className="size-4 animate-spin" />
            Updating appointment...
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <SectionTitle icon={<User className="size-4" />} title="Customer" />
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Name" value={customer ? `${customer.firstName} ${customer.lastName}` : null} />
              <DetailField label="Email" value={customer?.email} />
              <DetailField label="Phone" value={customer?.phoneNumber ?? null} />
              {customer && (
                <div className="sm:col-span-2">
                  <Link href={`/customers/${customer.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    View customer profile <ExternalLink className="size-3" />
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle icon={<Car className="size-4" />} title="Vehicle" />
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Make / Model" value={vehicle ? `${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() || "—" : "—"} />
              <DetailField label="Vehicle Reg No" value={vehicle?.registrationNumber as string | undefined} />
              <DetailField label="Year" value={vehicle?.year as string | number | undefined} />
              <DetailField label="VIN" value={vehicle?.vin as string | undefined} />
              <DetailField label="Color" value={vehicle?.color as string | undefined} />
              <DetailField label="Trim" value={vehicle?.trim as string | undefined} />
              <DetailField label="Warranty" value={vehicle?.warrantyStatus as string | undefined} />
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle icon={<Building2 className="size-4" />} title="Branch" />
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Branch" value={branch?.name as string | undefined} />
              <DetailField label="Branch Phone" value={branch?.phone as string | undefined} />
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle icon={<Clock className="size-4" />} title="Timing" />
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Duration" value={appointment.durationMins ? `${appointment.durationMins} mins` : null} />
              <DetailField label="Created" value={new Date(appointment.createdAt).toLocaleDateString()} />
              <DetailField label="Last Updated" value={new Date(appointment.updatedAt).toLocaleDateString()} />
              <DetailField label="Booked by" value={appointment.createdBy ? `${appointment.createdBy.firstName} ${appointment.createdBy.lastName}` : null} />
            </div>
          </div>
        </div>

        {appointment.notes && (
          <div className="mt-6 border-t border-slate-100 pt-6">
            <SectionTitle icon={<FileText className="size-4" />} title="Notes" />
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{appointment.notes}</p>
          </div>
        )}

        {Array.isArray(appointment.jobCards) && appointment.jobCards.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-6">
            <SectionTitle icon={<Wrench className="size-4" />} title={`Linked Job Cards (${appointment.jobCards.length})`} />
            <div className="mt-3 space-y-2">
              {(appointment.jobCards as Record<string, unknown>[]).map((jc) => (
                <Link
                  key={jc.id as string}
                  href={`/job-cards/${jc.id}`}
                  className="flex items-center gap-3 rounded-lg border border-slate-100 px-4 py-3 text-sm transition-colors hover:bg-slate-50"
                >
                  <span className="font-mono text-xs font-medium text-slate-800">{jc.jobNumber as string}</span>
                  <span className="text-slate-300">|</span>
                  <span className="flex-1 text-slate-500">{jc.description as string || "—"}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">
                    {String(jc.status ?? "").replace(/_/g, " ")}
                  </span>
                  <ExternalLink className="size-3.5 shrink-0 text-slate-300" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {canDelete && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowDelete(true)}
            className="gap-1.5 text-red-500 hover:text-red-700"
          >
            <Trash2 className="size-4" />
            Delete appointment
          </Button>
        </div>
      )}

      <ModalFame isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit appointment">
        <AppointmentEditForm
          appointment={appointment}
          onSuccess={() => setShowEdit(false)}
        />
      </ModalFame>

      <ModalFame isOpen={showJobCardCreate} onClose={() => setShowJobCardCreate(false)} title="Create Job Card">
        <JobCardCreateForm
          onSuccess={() => setShowJobCardCreate(false)}
          defaultValues={{
            appointmentId: appointment.id,
            customerId: appointment.customerId,
            vehicleId: appointment.vehicleId,
            branchName: (branch?.name as string) ?? "",
          }}
        />
      </ModalFame>

      <ConfirmDeleteModal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={() =>
          del.mutate(appointment.id, {
            onSuccess: () => {
              setShowDelete(false);
              router.push("/appointments");
            },
          })
        }
        title="Delete appointment"
        message="Are you sure you want to delete this appointment? This action cannot be undone."
        isPending={del.isPending}
      />
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

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      {icon}
      {title}
    </div>
  );
}
