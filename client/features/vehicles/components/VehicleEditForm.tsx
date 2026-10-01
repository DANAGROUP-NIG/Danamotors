"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { useVehicleModels } from "@/features/warranty/hooks/use-warranty";
import { useUpdateVehicle } from "../hooks/use-update-vehicle";
import { updateVehicleSchema, type UpdateVehicleFormValues } from "../schemas/vehicle.schema";
import type { Vehicle } from "../types/vehicle.types";

interface VehicleEditFormProps {
  vehicle: Vehicle;
  onSuccess?: () => void;
}

export function VehicleEditForm({ vehicle, onSuccess }: VehicleEditFormProps) {
  const update = useUpdateVehicle(vehicle.id);
  const { data: models = [] } = useVehicleModels();
  const { hasPermission, isSuperAdmin } = useAuth();
  const canSetSaleDate = isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.UPDATE);
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<UpdateVehicleFormValues>({
    resolver: zodResolver(updateVehicleSchema),
    defaultValues: {
      registrationNumber: vehicle.registrationNumber ?? "",
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
      year: vehicle.year ?? undefined,
      trim: vehicle.trim ?? "",
      color: vehicle.color ?? "",
      vehicleModelId: vehicle.vehicleModelId ?? "",
      warrantyStartDate: vehicle.warrantyStartDate ? vehicle.warrantyStartDate.slice(0, 10) : "",
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
      vehicleModelId: vehicle.vehicleModelId ?? "",
      warrantyStartDate: vehicle.warrantyStartDate ? vehicle.warrantyStartDate.slice(0, 10) : "",
      ownershipStatus: vehicle.ownershipStatus ?? "",
    });
  }, [vehicle, reset]);

  function onSubmit(values: UpdateVehicleFormValues) {
    const { vehicleModelId, warrantyStartDate, ...rest } = values;
    const payload = {
      ...(Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== "" && v !== undefined)) as UpdateVehicleFormValues),
      // Model and sale date can be cleared, so send null rather than dropping them.
      vehicleModelId: vehicleModelId || null,
      ...(canSetSaleDate && { warrantyStartDate: warrantyStartDate || null }),
    };
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model (warranty policy)" error={errors.vehicleModelId?.message}>
          <select className={inputCls} {...register("vehicleModelId")}>
            <option value="">Not linked</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.make} {m.name} ({m.code})
              </option>
            ))}
          </select>
        </Field>
        {canSetSaleDate && (
          <Field label="Sale date (warranty start)" error={errors.warrantyStartDate?.message}>
            <Controller
              control={control}
              name="warrantyStartDate"
              render={({ field }) => <DateInput value={field.value} onChange={field.onChange} />}
            />
          </Field>
        )}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Warranty coverage is calculated from the model policy, sale date and odometer — it is not typed in.
      </p>
      <Field label="Ownership Status" error={errors.ownershipStatus?.message}>
        <input className={inputCls} {...register("ownershipStatus")} />
      </Field>
      <Button type="submit" size="sm" disabled={update.isPending}>
        {update.isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
