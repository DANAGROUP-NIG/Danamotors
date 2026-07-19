"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { useUpdateVehicle } from "../hooks/use-update-vehicle";
import { updateVehicleSchema, type UpdateVehicleFormValues } from "../schemas/vehicle.schema";
import type { Vehicle } from "../types/vehicle.types";

const inputCls = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  );
}

interface VehicleEditFormProps {
  vehicle: Vehicle;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function VehicleEditForm({ vehicle, onSuccess, onCancel }: VehicleEditFormProps) {
  const update = useUpdateVehicle(vehicle.id);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<UpdateVehicleFormValues>({
    resolver: zodResolver(updateVehicleSchema),
    defaultValues: {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      licensePlate: vehicle.licensePlate,
      vin: vehicle.vin ?? "",
      color: vehicle.color ?? "",
      mileage: vehicle.mileage ?? undefined,
    },
  });

  useEffect(() => {
    reset({
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      licensePlate: vehicle.licensePlate,
      vin: vehicle.vin ?? "",
      color: vehicle.color ?? "",
      mileage: vehicle.mileage ?? undefined,
    });
  }, [vehicle, reset]);

  function onSubmit(values: UpdateVehicleFormValues) {
    update.mutate(values, { onSuccess });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
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
        <Field label="License plate" error={errors.licensePlate?.message}>
          <input className={inputCls} {...register("licensePlate")} />
        </Field>
        <Field label="Color" error={errors.color?.message}>
          <input className={inputCls} {...register("color")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="VIN (optional)" error={errors.vin?.message}>
          <input className={inputCls} {...register("vin")} />
        </Field>
        <Field label="Mileage (km)" error={errors.mileage?.message}>
          <input type="number" className={inputCls} {...register("mileage")} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={update.isPending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
