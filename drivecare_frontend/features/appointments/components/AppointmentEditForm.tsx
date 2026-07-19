"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { useUpdateAppointment } from "../hooks/use-update-appointment";
import { updateAppointmentSchema, type UpdateAppointmentFormValues } from "../schemas/appointment.schema";
import type { Appointment } from "../types/appointment.types";

const inputCls = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const selectCls = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  );
}

const SERVICE_TYPES = ["Routine Service", "Diagnostics", "Repair", "Inspection", "Oil Change", "Tyre Change"];

const STATUS_OPTIONS = [
  { value: "booked", label: "Booked" },
  { value: "checked_in", label: "Checked In" },
  { value: "inspection", label: "Inspection" },
  { value: "awaiting_approval", label: "Awaiting Approval" },
  { value: "in_repair", label: "In Repair" },
  { value: "quality_check", label: "Quality Check" },
  { value: "ready", label: "Ready" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

interface AppointmentEditFormProps {
  appointment: Appointment;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function AppointmentEditForm({ appointment, onSuccess, onCancel }: AppointmentEditFormProps) {
  const update = useUpdateAppointment(appointment.id);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<UpdateAppointmentFormValues>({
    resolver: zodResolver(updateAppointmentSchema),
    defaultValues: {
      serviceType: appointment.serviceType,
      scheduledAt: appointment.scheduledAt.slice(0, 16), // trim to datetime-local format
      status: appointment.status,
      notes: appointment.notes ?? "",
    },
  });

  useEffect(() => {
    reset({
      serviceType: appointment.serviceType,
      scheduledAt: appointment.scheduledAt.slice(0, 16),
      status: appointment.status,
      notes: appointment.notes ?? "",
    });
  }, [appointment, reset]);

  function onSubmit(values: UpdateAppointmentFormValues) {
    update.mutate(values, { onSuccess });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Service type" error={errors.serviceType?.message}>
          <select className={selectCls} {...register("serviceType")}>
            {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Scheduled date" error={errors.scheduledAt?.message}>
          <input type="datetime-local" className={inputCls} {...register("scheduledAt")} />
        </Field>
        <Field label="Status" error={errors.status?.message}>
          <select className={selectCls} {...register("status")}>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes (optional)" error={errors.notes?.message}>
        <textarea
          className="min-h-16 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          {...register("notes")}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={update.isPending}>Cancel</Button>
        )}
      </div>
    </form>
  );
}
