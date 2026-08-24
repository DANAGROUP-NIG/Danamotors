"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateTimeInput } from "@/components/forms/DateTimeInput";
import { usePortalVehicles } from "../hooks/use-portal";
import { usePortalServices } from "../hooks/use-portal";
import { useBookPortalAppointment } from "../hooks/use-portal-mutations";
import {
  bookPortalAppointmentSchema,
  type BookPortalAppointmentFormValues,
} from "../schemas/portal.schema";

interface BookAppointmentFormProps {
  onSuccess?: () => void;
}

export function BookAppointmentForm({ onSuccess }: BookAppointmentFormProps) {
  const { data: vehicles, isLoading: vehiclesLoading } = usePortalVehicles();
  const { data: services, isLoading: servicesLoading } = usePortalServices();
  const book = useBookPortalAppointment();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<BookPortalAppointmentFormValues>({
    resolver: zodResolver(bookPortalAppointmentSchema),
  });

  const scheduledAt = watch("scheduledAt");

  function onSubmit(values: BookPortalAppointmentFormValues) {
    book.mutate(
      {
        vehicleId: values.vehicleId,
        serviceId: values.serviceId,
        scheduledAt: new Date(values.scheduledAt).toISOString(),
        durationMins: values.durationMins ? Number(values.durationMins) : undefined,
        notes: values.notes || undefined,
      },
      {
        onSuccess: () => {
          reset();
          onSuccess?.();
        },
      },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <Field label="Vehicle" error={errors.vehicleId?.message}>
        {vehiclesLoading ? (
          <p className="py-1 text-sm text-muted-foreground">Loading vehicles…</p>
        ) : vehicles && vehicles.length > 0 ? (
          <select
            className={inputCls}
            {...register("vehicleId")}
          >
            <option value="">Select a vehicle</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {`${v.make ?? ""} ${v.model ?? ""}`.trim() || v.registrationNumber || v.vin}
                {v.year ? ` (${v.year})` : ""}
              </option>
            ))}
          </select>
        ) : (
          <p className="py-1 text-sm text-muted-foreground">
            No vehicles registered yet. Add a vehicle first.
          </p>
        )}
      </Field>

      <Field label="Service" error={errors.serviceId?.message}>
        {servicesLoading ? (
          <p className="py-1 text-sm text-muted-foreground">Loading services…</p>
        ) : services && services.length > 0 ? (
          <select
            className={inputCls}
            {...register("serviceId")}
          >
            <option value="">Select a service</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.durationMins != null ? ` (${s.durationMins} min)` : ""}
              </option>
            ))}
          </select>
        ) : (
          <p className="py-1 text-sm text-muted-foreground">
            No services available yet.
          </p>
        )}
      </Field>

      <Field label="Date & time" error={errors.scheduledAt?.message}>
        <DateTimeInput
          value={scheduledAt}
          onChange={(iso) => setValue("scheduledAt", iso, { shouldValidate: true })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Duration (minutes)" error={errors.durationMins?.message}>
          <input
            type="number"
            className={inputCls}
            placeholder="60"
            {...register("durationMins")}
          />
        </Field>
        <Field label="Notes" error={errors.notes?.message}>
          <input className={inputCls} placeholder="Describe the service needed" {...register("notes")} />
        </Field>
      </div>

      <Button type="submit" disabled={book.isPending} className="mt-1">
        {book.isPending ? "Booking…" : "Book appointment"}
      </Button>
    </form>
  );
}
