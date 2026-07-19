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
            <Field label="License plate" error={errors.licensePlate?.message}>
              <input className={inputCls} placeholder="LND-123AB" {...register("licensePlate")} />
            </Field>
            <Field label="Color" error={errors.color?.message}>
              <input className={inputCls} placeholder="Silver" {...register("color")} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="VIN (optional)" error={errors.vin?.message}>
              <input className={inputCls} {...register("vin")} />
            </Field>
            <Field label="Mileage (km)" error={errors.mileage?.message}>
              <input type="number" className={inputCls} placeholder="0" {...register("mileage")} />
            </Field>
          </div>
          <Button type="submit" disabled={create.isPending} className="mt-1">
            {create.isPending ? "Adding…" : "Add vehicle"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
