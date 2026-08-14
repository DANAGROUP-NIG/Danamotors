"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateTimeInput } from "@/components/forms/DateTimeInput";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCreateAppointment } from "../hooks/use-create-appointment";
import { useServices } from "@/features/services/hooks/use-services";
import { CustomerSelectWithCreate } from "@/features/customers/components/CustomerSelectWithCreate";
import { VehicleSelectWithCreate } from "@/features/vehicles/components/VehicleSelectWithCreate";
import {
  createAppointmentSchema,
  type CreateAppointmentFormValues,
} from "../schemas/appointment.schema";

interface AppointmentCreateFormProps {
  onSuccess?: () => void;
}

export function AppointmentCreateForm({ onSuccess }: AppointmentCreateFormProps) {
  const create = useCreateAppointment();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const branches = useBranchStore((s) => s.branches);
  const { isSuperAdmin } = useAuth();
  const { data: services, isLoading: servicesLoading } = useServices({
    limit: 100,
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateAppointmentFormValues>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: {
      branchName: isSuperAdmin ? "" : (activeBranch?.name ?? ""),
    },
  });

  const selectedCustomerId = watch("customerId");
  const selectedVehicleId = watch("vehicleId");

  function onSubmit(values: CreateAppointmentFormValues) {
    const payload = {
      ...values,
      scheduledAt: new Date(values.scheduledAt).toISOString(),
    };
    create.mutate(payload, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer" error={errors.customerId?.message}>
          <CustomerSelectWithCreate
            value={selectedCustomerId}
            onChange={(customerId) => {
              setValue("customerId", customerId, { shouldValidate: true });
              setValue("vehicleId", "", { shouldValidate: true });
            }}
            branchId={isSuperAdmin ? undefined : activeBranch?.id}
          />
        </Field>
        <Field label="Vehicle Reg No" error={errors.vehicleId?.message}>
          <VehicleSelectWithCreate
            value={selectedVehicleId}
            customerId={selectedCustomerId}
            onChange={(vehicleId) => {
              setValue("vehicleId", vehicleId, { shouldValidate: true });
            }}
            onVehicleSelect={(vehicle) => {
              const ownerId = vehicle.customer?.id ?? "";
              if (ownerId) {
                setValue("customerId", ownerId, { shouldValidate: true });
              }
            }}
            branchId={isSuperAdmin ? undefined : activeBranch?.id}
          />
        </Field>
      </div>
      <Field label="Service" error={errors.serviceId?.message}>
        {servicesLoading ? (
          <p className="py-1 text-sm text-muted-foreground">Loading services…</p>
        ) : services && services.services.length > 0 ? (
          <select
            className={inputCls}
            {...register("serviceId")}
          >
            <option value="">Select a service</option>
            {services.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.durationMins != null ? ` (${s.durationMins} min)` : ""}
              </option>
            ))}
          </select>
        ) : (
          <p className="py-1 text-sm text-muted-foreground">
            No services available. Add services first.
          </p>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Branch" error={errors.branchName?.message}>
          {isSuperAdmin ? (
            <select className={inputCls} {...register("branchName")}>
              <option value="">Select branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={inputCls}
              readOnly
              value={activeBranch?.name ?? ""}
            />
          )}
        </Field>
        <Field label="Scheduled date & time" error={errors.scheduledAt?.message}>
          <Controller
            control={control}
            name="scheduledAt"
            render={({ field }) => (
              <DateTimeInput value={field.value} onChange={field.onChange} />
            )}
          />
        </Field>
      </div>
      <Field label="Duration (minutes, optional)" error={errors.durationMins?.message}>
        <input
          type="number"
          className={inputCls}
          placeholder="e.g. 60"
          {...register("durationMins")}
        />
      </Field>
      <Field label="Notes (optional)" error={errors.notes?.message}>
        <textarea
          className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Any relevant details for the technician…"
          {...register("notes")}
        />
      </Field>
      <Button type="submit" disabled={create.isPending} className="mt-1">
        {create.isPending ? "Booking…" : "Book appointment"}
      </Button>
    </form>
  );
}

