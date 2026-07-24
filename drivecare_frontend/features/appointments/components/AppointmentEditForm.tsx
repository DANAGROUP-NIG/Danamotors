"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useUpdateAppointment } from "../hooks/use-update-appointment";
import {
  updateAppointmentSchema,
  type UpdateAppointmentFormValues,
} from "../schemas/appointment.schema";
import type { Appointment } from "../types/appointment.types";

const STATUS_OPTIONS = [
  { value: "Pending", label: "Pending" },
  { value: "Checked In", label: "Checked In" },
  { value: "Inspection", label: "Inspection" },
  { value: "Awaiting Approval", label: "Awaiting Approval" },
  { value: "In Repair", label: "In Repair" },
  { value: "Quality Check", label: "Quality Check" },
  { value: "Ready", label: "Ready" },
  { value: "Completed", label: "Completed" },
  { value: "Cancelled", label: "Cancelled" },
] as const;

interface AppointmentEditFormProps {
  appointment: Appointment;
  onSuccess?: () => void;
}

export function AppointmentEditForm({
  appointment,
  onSuccess,
}: AppointmentEditFormProps) {
  const update = useUpdateAppointment(appointment.id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateAppointmentFormValues>({
    resolver: zodResolver(updateAppointmentSchema),
    defaultValues: {
      scheduledAt: appointment.scheduledAt.slice(0, 16),
      status: appointment.status,
      notes: appointment.notes ?? "",
      durationMins: appointment.durationMins ?? undefined,
    },
  });

  useEffect(() => {
    reset({
      scheduledAt: appointment.scheduledAt.slice(0, 16),
      status: appointment.status,
      notes: appointment.notes ?? "",
      durationMins: appointment.durationMins ?? undefined,
    });
  }, [appointment, reset]);

  function onSubmit(values: UpdateAppointmentFormValues) {
    const payload = {
      ...values,
      scheduledAt: values.scheduledAt
        ? new Date(values.scheduledAt).toISOString()
        : undefined,
    };
    update.mutate(payload, { onSuccess });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Scheduled date" error={errors.scheduledAt?.message}>
          <input
            type="datetime-local"
            className={inputCls}
            {...register("scheduledAt")}
          />
        </Field>
        <Field label="Status" error={errors.status?.message}>
          <select className={inputCls} {...register("status")}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Duration (minutes)" error={errors.durationMins?.message}>
          <input
            type="number"
            className={inputCls}
            placeholder="e.g. 60"
            {...register("durationMins")}
          />
        </Field>
      </div>
      <Field label="Notes (optional)" error={errors.notes?.message}>
        <textarea
          className="min-h-16 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          {...register("notes")}
        />
      </Field>
      <Button type="submit" size="sm" disabled={update.isPending}>
        {update.isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
