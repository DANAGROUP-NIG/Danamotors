"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateTimeInput } from "@/components/forms/DateTimeInput";
import { useUpdateAppointment } from "../hooks/use-update-appointment";
import {
  updateAppointmentSchema,
  type UpdateAppointmentFormValues,
} from "../schemas/appointment.schema";
import type { Appointment } from "../types/appointment.types";
import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { BookingRequestsEditor, cleanRequests, ServiceTypeField, type BookingFields } from "./BookingDetailsFields";

function formValues(appointment: Appointment): UpdateAppointmentFormValues {
  return {
    scheduledAt: appointment.scheduledAt.slice(0, 16),
    status: appointment.status,
    notes: appointment.notes ?? "",
    durationMins: appointment.durationMins ?? undefined,
    serviceTypeId: appointment.serviceTypeId ?? "",
    requests: (appointment.requests ?? []).map((request) => ({
      complaintCodeId: request.complaintCodeId ?? "",
      description: request.description,
      estimatedParts: request.estimatedParts,
      estimatedLabour: request.estimatedLabour,
      estimatedOil: request.estimatedOil,
    })),
  };
}

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
  { value: "No Show", label: "No-show" },
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
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateAppointmentFormValues>({
    resolver: zodResolver(updateAppointmentSchema),
    defaultValues: formValues(appointment),
  });

  useEffect(() => {
    reset(formValues(appointment));
  }, [appointment, reset]);

  function onSubmit(values: UpdateAppointmentFormValues) {
    const payload = {
      ...values,
      scheduledAt: values.scheduledAt
        ? new Date(values.scheduledAt).toISOString()
        : undefined,
      serviceTypeId: values.serviceTypeId || null,
      requests: cleanRequests(values.requests),
    };
    update.mutate(payload, { onSuccess });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Scheduled date" error={errors.scheduledAt?.message}>
          <Controller
            control={control}
            name="scheduledAt"
            render={({ field }) => (
              <DateTimeInput value={field.value} onChange={field.onChange} />
            )}
          />
        </Field>
        <Field label="Status" error={errors.status?.message}>
          <select className={inputCls} {...register("status")}>
            {STATUS_OPTIONS
              // Checking in records the odometer and runs the warranty check, so it has its own dialog.
              .filter((s) => s.value !== "Checked In" || appointment.status === "Checked In")
              // A no-show can only be recorded before the vehicle is checked in.
              .filter((s) => s.value !== "No Show" || ["Pending", "No Show"].includes(appointment.status))
              .map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
          </select>
          {appointment.status === "Pending" && (
            <span className="text-xs text-muted-foreground">Use “Mark as Checked In” to check the vehicle in.</span>
          )}
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
      <ServiceTypeField control={control as unknown as Control<BookingFields>} error={errors.serviceTypeId?.message} />
      <BookingRequestsEditor
        control={control as unknown as Control<BookingFields>}
        register={register as unknown as UseFormRegister<BookingFields>}
        errors={errors as FieldErrors<BookingFields>}
      />
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
