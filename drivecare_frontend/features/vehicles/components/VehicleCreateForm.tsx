"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateVehicle } from "../hooks/use-create-vehicle";
import { createVehicleSchema, type CreateVehicleFormValues } from "../schemas/vehicle.schema";

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

interface VehicleCreateFormProps {
  onSuccess?: () => void;
}

export function VehicleCreateForm({ onSuccess }: VehicleCreateFormProps) {
  const create = useCreateVehicle();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateVehicleFormValues>({
    resolver: zodResolver(createVehicleSchema),
  });

  function onSubmit(values: CreateVehicleFormValues) {
    create.mutate(values, { onSuccess: () => { reset(); onSuccess?.(); } });
  }

  return (
    <Card>
      <CardHeader><CardTitle>Add vehicle</CardTitle></CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <Field label="Customer ID" error={errors.customerId?.message}>
            <input className={inputCls} placeholder="Customer UUID" {...register("customerId")} />
          </Field>
          <Field label="VIN" error={errors.vin?.message}>
            <input className={inputCls} placeholder="Vehicle Identification Number" {...register("vin")} />
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
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Warranty Provider" error={errors.warrantyProvider?.message}>
              <input className={inputCls} placeholder="Provider name" {...register("warrantyProvider")} />
            </Field>
            <Field label="Warranty Status" error={errors.warrantyStatus?.message}>
              <input className={inputCls} placeholder="Active" {...register("warrantyStatus")} />
            </Field>
            <Field label="Warranty Expires" error={errors.warrantyExpiresAt?.message}>
              <input type="datetime-local" className={inputCls} {...register("warrantyExpiresAt")} />
            </Field>
          </div>
          <Field label="Ownership Status" error={errors.ownershipStatus?.message}>
            <input className={inputCls} placeholder="Owned" {...register("ownershipStatus")} />
          </Field>
          <Button type="submit" disabled={create.isPending} className="mt-1">
            {create.isPending ? "Adding…" : "Add vehicle"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
