"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateTimeInput } from "@/components/forms/DateTimeInput";
import { useUpdateVehicle } from "../hooks/use-update-vehicle";
import { updateVehicleSchema, type UpdateVehicleFormValues } from "../schemas/vehicle.schema";
import type { Vehicle } from "../types/vehicle.types";

interface VehicleEditFormProps {
  vehicle: Vehicle;
  onSuccess?: () => void;
}

export function VehicleEditForm({ vehicle, onSuccess }: VehicleEditFormProps) {
  const update = useUpdateVehicle(vehicle.id);
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<UpdateVehicleFormValues>({
    resolver: zodResolver(updateVehicleSchema),
    defaultValues: {
      registrationNumber: vehicle.registrationNumber ?? "",
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
      year: vehicle.year ?? undefined,
      trim: vehicle.trim ?? "",
      color: vehicle.color ?? "",
      warrantyProvider: vehicle.warrantyProvider ?? "",
      warrantyStatus: vehicle.warrantyStatus ?? "",
      warrantyExpiresAt: vehicle.warrantyExpiresAt ? vehicle.warrantyExpiresAt.slice(0, 16) : "",
      ownershipStatus: vehicle.ownershipStatus ?? "",
    },
  });

  useEffect(() => {
    reset({
      registrationNumber: vehicle.registrationNumber ?? "",
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
      year: vehicle.year ?? undefined,
      trim: vehicle.trim ?? "",
      color: vehicle.color ?? "",
      warrantyProvider: vehicle.warrantyProvider ?? "",
      warrantyStatus: vehicle.warrantyStatus ?? "",
      warrantyExpiresAt: vehicle.warrantyExpiresAt ? vehicle.warrantyExpiresAt.slice(0, 16) : "",
      ownershipStatus: vehicle.ownershipStatus ?? "",
    });
  }, [vehicle, reset]);

  function onSubmit(values: UpdateVehicleFormValues) {
    const payload = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== "" && v !== undefined),
    ) as UpdateVehicleFormValues;
    update.mutate(payload, { onSuccess });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <Field label="Registration number (Reg No)" error={errors.registrationNumber?.message}>
        <input className={inputCls} placeholder="e.g. KJA-837-AA" {...register("registrationNumber")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Make" error={errors.make?.message}>
          <input className={inputCls} {...register("make")} />
        </Field>
        <Field label="Model" error={errors.model?.message}>
          <input className={inputCls} {...register("model")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Year" error={errors.year?.message}>
          <input type="number" className={inputCls} {...register("year")} />
        </Field>
        <Field label="Trim" error={errors.trim?.message}>
          <input className={inputCls} {...register("trim")} />
        </Field>
        <Field label="Color" error={errors.color?.message}>
          <input className={inputCls} {...register("color")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Warranty Provider" error={errors.warrantyProvider?.message}>
          <input className={inputCls} {...register("warrantyProvider")} />
        </Field>
        <Field label="Warranty Status" error={errors.warrantyStatus?.message}>
          <input className={inputCls} {...register("warrantyStatus")} />
        </Field>
        <Field label="Warranty Expires" error={errors.warrantyExpiresAt?.message}>
          <Controller
            control={control}
            name="warrantyExpiresAt"
            render={({ field }) => (
              <DateTimeInput value={field.value} onChange={field.onChange} />
            )}
          />
        </Field>
      </div>
      <Field label="Ownership Status" error={errors.ownershipStatus?.message}>
        <input className={inputCls} {...register("ownershipStatus")} />
      </Field>
      <Button type="submit" size="sm" disabled={update.isPending}>
        {update.isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
