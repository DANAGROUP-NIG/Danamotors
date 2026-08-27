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
  Calendar,
  FileText,
  ExternalLink,
  Globe,
  ChevronRight,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useAppointment } from "@/features/appointments";
import { useUpdateAppointment } from "@/features/appointments/hooks/use-update-appointment";
import { useDeleteAppointment } from "@/features/appointments/hooks/use-delete-appointment";
import ModalFame from "@/components/modals/ModalFame";
import { AppointmentEditForm } from "@/features/appointments/components/AppointmentEditForm";
import { JobCardCreateForm } from "@/features/job-cards/components/JobCardCreateForm";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { AppointmentStatusStepper } from "@/features/appointments/components/AppointmentStatusStepper";
import type { Appointment } from "@/features/appointments/types/appointment.types";

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

const STATUS_TRANSITION_PERMISSIONS: Record<string, string> = {
  "Checked In": "appointment:update",
  Inspection: "appointment:update",
  "Awaiting Approval": "appointment:update",
  "In Repair": "appointment:update",
  "Quality Check": "appointment:update",
  Ready: "appointment:update",
  Completed: "appointment:update",
};


function DetailItem({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        {icon}
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="text-[15px] leading-5 text-slate-500">{label}</p>
        <div className="mt-1 text-[15px] font-semibold leading-6 text-slate-900">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useAppointment(id);
  const { hasPermission } = useAuth();
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
        <Link
          href="/appointments"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
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
  const canTransition =
    nextStatus &&
    hasPermission(STATUS_TRANSITION_PERMISSIONS[nextStatus] ?? "");
  const canCancel =
    hasPermission("appointment:update") &&
    appointment.status !== "Completed" &&
    appointment.status !== "Cancelled";
  const canEdit = hasPermission("appointment:update");
  const canDelete = hasPermission("appointment:delete");
  const canCreateJobCard =
    hasPermission("appointment:update") && appointment.status !== "Cancelled";

  function handleStatusTransition() {
    if (!nextStatus) return;
    update.mutate({ status: nextStatus as Appointment["status"] });
  }

  function handleCancel() {
    if (!confirm("Are you sure you want to cancel this appointment?")) return;
    update.mutate({ status: "Cancelled" });
  }

  const appointmentRef = `APT-${String(appointment.id).slice(0, 4)}`.toUpperCase();

  const customerName = customer
    ? `${customer.firstName} ${customer.lastName}`
    : "—";

  const vehicleLabel = vehicle
    ? [
        `${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim(),
        vehicle.year ? String(vehicle.year) : "",
      ]
        .filter(Boolean)
        .join(" ") +
      (vehicle.registrationNumber ? ` (${vehicle.registrationNumber})` : "")
    : "—";

  const scheduled = new Date(appointment.scheduledAt);
  const scheduledLabel = `${scheduled.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} · ${scheduled.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;

  const agentName = appointment.createdBy
  ? `${appointment.createdBy.firstName} ${appointment.createdBy.lastName}`
  : "—";

  // Rendered once, below the details grid
  const actionButtons = (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="flex flex-wrap items-center gap-2">
        {canTransition && (
          <Button
            size="sm"
            onClick={handleStatusTransition}
            disabled={update.isPending}
            className="gap-1.5 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
          >
            <CheckCircle className="size-4" />
            Mark as {nextStatus}
          </Button>
        )}
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowEdit(true)}
            className="gap-1.5 border-slate-200 hover:bg-slate-100"
          >
            <Pencil className="size-4" />
            Edit
          </Button>
        )}
        {canCreateJobCard && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowJobCardCreate(true)}
            className="gap-1.5 border-slate-200 hover:bg-slate-100"
          >
            <Wrench className="size-4" />
            Create Job Card
          </Button>
        )}
        {canCancel && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={update.isPending}
            className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <XCircle className="size-4" />
            Cancel
          </Button>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowDelete(true)}
            className="ml-auto gap-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        )}
      </div>

      {update.isPending && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-700">
          <Loader2 className="size-4 animate-spin" />
          Updating appointment...
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/60 px-4 py-8 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
          <Link
        href="/appointments"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-4" /> Back to Service Appointments
      </Link>
          {/* Title */}
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
            Appointment Details
          </h1>

          {appointment.status === "Cancelled" && (
            <span className="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              Cancelled
            </span>
          )}

          {/* Enquiry banner */}
          {customer && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600">
                <Info className="size-3.5 text-white" />
              </span>
              <p className="text-[15px] leading-6 text-blue-700">
                Pre-filling from enquiry by {customerName}
                {customer.email && ` (${customer.email})`}
                {vehicle && (
                  <>
                    {" — "}
                    {`${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim()}
                    {vehicle.year ? ` ${vehicle.year}` : ""}
                    {vehicle.registrationNumber
                      ? ` · ${vehicle.registrationNumber}`
                      : ""}
                  </>
                )}
              </p>
            </div>
          )}

          {/* Status Stepper */}
          <div className="mt-8">
            <AppointmentStatusStepper currentStatus={appointment.status} />
          </div>

          {/* Details card */}
          <div className="mt-8 rounded-2xl border border-slate-200/80 p-6">
            <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
              <DetailItem icon={<User className="size-5" />} label="Customer">
                {customerName}
              </DetailItem>

              <DetailItem icon={<Car className="size-5" />} label="Vehicle">
                {vehicleLabel}
              </DetailItem>

              <DetailItem
                icon={<Building2 className="size-5" />}
                label="Branch"
              >
                {branch?.name ? String(branch.name) : "—"}
              </DetailItem>

              <DetailItem
                icon={<Calendar className="size-5" />}
                label="Scheduled"
              >
                {scheduledLabel}
              </DetailItem>

              <DetailItem icon={<Globe className="size-5" />} label="Source">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
                  <Globe className="size-3.5" />
                  {appointment.source || "Online Booking"}
                </span>
              </DetailItem>

              <DetailItem icon={<User className="size-5" />} label="Agent">
                {agentName}
              </DetailItem>
            </div>

            {/* Notes */}
            {appointment.notes && (
              <div className="mt-8 border-t border-slate-100 pt-6">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600">
                  <FileText className="size-4" />
                  Notes
                </div>
                <p className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {appointment.notes}
                </p>
              </div>
            )}

            {/* Job Cards */}
            {Array.isArray(appointment.jobCards) &&
              appointment.jobCards.length > 0 && (
                <div className="mt-8 border-t border-slate-100 pt-6">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600">
                    <Wrench className="size-4" />
                    Linked Job Cards ({appointment.jobCards.length})
                  </div>
                  <div className="space-y-2">
                    {(appointment.jobCards as Record<string, unknown>[]).map(
                      (jc) => (
                        <Link
                          key={jc.id as string}
                          href={`/job-cards/${jc.id}`}
                          className="group flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm transition-all hover:border-slate-300 hover:bg-slate-50"
                        >
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-800">
                            {jc.jobNumber as string}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="flex-1 text-slate-600">
                            {(jc.description as string) || "—"}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs capitalize text-slate-600">
                            {String(jc.status ?? "").replace(/_/g, " ")}
                          </span>
                          <ExternalLink className="size-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
                        </Link>
                      ),
                    )}
                  </div>
                </div>
              )}
          </div>

          {/* Actions below the details grid */}
          {actionButtons}
        </div>

        {/* Modals */}
        <ModalFame
          isOpen={showEdit}
          onClose={() => setShowEdit(false)}
          title="Edit appointment"
        >
          <AppointmentEditForm
            appointment={appointment}
            onSuccess={() => setShowEdit(false)}
          />
        </ModalFame>

        <ModalFame
          isOpen={showJobCardCreate}
          onClose={() => setShowJobCardCreate(false)}
          title="Create Job Card"
        >
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
    </div>
  );
}
