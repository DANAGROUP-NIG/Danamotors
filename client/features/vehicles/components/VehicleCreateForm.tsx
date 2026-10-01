"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { CustomerSelectWithCreate } from "@/features/customers/components/CustomerSelectWithCreate";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { DateInput } from "@/components/forms/DateInput";
import { useVehicleModels } from "@/features/warranty/hooks/use-warranty";
import { useCreateVehicle } from "../hooks/use-create-vehicle";
import { createVehicleSchema, type CreateVehicleFormValues } from "../schemas/vehicle.schema";

interface VehicleCreateFormProps {
  onSuccess?: () => void;
}

export function VehicleCreateForm({ onSuccess }: VehicleCreateFormProps) {
  const create = useCreateVehicle();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { isSuperAdmin, hasPermission } = useAuth();
  const canSetSaleDate = isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.UPDATE);
  const { data: models = [] } = useVehicleModels();

  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CreateVehicleFormValues>({
    resolver: zodResolver(createVehicleSchema),
  });

  const selectedCustomerId = watch("customerId");

  function onSubmit(values: CreateVehicleFormValues) {
    const { vehicleModelId, warrantyStartDate, ...rest } = values;
    const payload = {
      ...rest,
      ...(vehicleModelId && { vehicleModelId }),
      ...(canSetSaleDate && warrantyStartDate && { warrantyStartDate }),
    };
    create.mutate(payload, { onSuccess: () => { reset(); onSuccess?.(); } });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <Field label="Customer" error={errors.customerId?.message}>
        <CustomerSelectWithCreate
          value={selectedCustomerId}
          onChange={(customerId) => setValue("customerId", customerId, { shouldValidate: true })}
          branchId={isSuperAdmin ? undefined : activeBranch?.id}
        />
      </Field>
      <Field label="VIN" error={errors.vin?.message}>
        <input className={inputCls} placeholder="Vehicle Identification Number" {...register("vin")} />
      </Field>
      <Field label="Registration number (Reg No)" error={errors.registrationNumber?.message}>
        <input className={inputCls} placeholder="e.g. KJA-837-AA" {...register("registrationNumber")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Make" error={errors.make?.message}>
          <input className={inputCls} placeholder="Toyota" {...register("make")} />
        </Field>
        <Field label="Model" error={errors.model?.message}>
          <input className={inputCls} placeholder="Corolla" {...register("model")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Year" error={errors.year?.message}>
          <input type="number" className={inputCls} placeholder="2020" {...register("year")} />
        </Field>
        <Field label="Trim (optional)" error={errors.trim?.message}>
          <input className={inputCls} placeholder="SE" {...register("trim")} />
        </Field>
        <Field label="Color" error={errors.color?.message}>
          <input className={inputCls} placeholder="Silver" {...register("color")} />
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
      <Button type="submit" disabled={create.isPending} className="mt-1">
        {create.isPending ? "Adding…" : "Add vehicle"}
      </Button>
    </form>
  );
}

