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
import {
  DELETE_ROLES,
  SERVICE_UPDATE_ROLES,
  APPOINTMENT_UPDATE_ROLES,
} from "@/features/auth/roles";
import { useAppointment } from "@/features/appointments";
import { useUpdateAppointment } from "@/features/appointments/hooks/use-update-appointment";
import { useDeleteAppointment } from "@/features/appointments/hooks/use-delete-appointment";
import ModalFame from "@/components/modals/ModalFame";
import { AppointmentEditForm } from "@/features/appointments/components/AppointmentEditForm";
import { JobCardCreateForm } from "@/features/job-cards/components/JobCardCreateForm";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { AppointmentStatusStepper } from "@/features/appointments/components/AppointmentStatusStepper"; 
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
  "Awaiting Approval": [
    "technician",
    "serviceadviser",
    "superadmin",
    "admin",
    "workshopmanager",
  ],
  "In Repair": ["serviceadviser", "superadmin", "admin", "workshopmanager"],
  "Quality Check": [
    "technician",
    "serviceadviser",
    "superadmin",
    "admin",
    "workshopmanager",
  ],
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
    nextStatus && hasAccess(STATUS_TRANSITION_ROLES[nextStatus] ?? []);
  const canCancel =
    hasAccess(CANCEL_ROLES) &&
    appointment.status !== "Completed" &&
    appointment.status !== "Cancelled";
  const canEdit = hasAccess(APPOINTMENT_UPDATE_ROLES);
  const canDelete = hasAccess(DELETE_ROLES);
  const canCreateJobCard =
    hasAccess(SERVICE_UPDATE_ROLES) && appointment.status !== "Cancelled";

  const isTerminal =
    appointment.status === "Completed" || appointment.status === "Cancelled";

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
      <Link
        href="/appointments"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-4" /> Back to Service & Enquiry Appointments
      </Link>

      {/* ✅ ADD THE STEPPER HERE */}
      <AppointmentStatusStepper currentStatus={appointment.status} />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {/* ... rest of the content */}
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-slate-700">{value ?? "—"}</p>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      {icon}
      {title}
    </div>
  );
}
