"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAllCustomers } from "@/features/appointments/hooks/use-all-customers";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCreateVehicle } from "../hooks/use-create-vehicle";
import { createVehicleSchema, type CreateVehicleFormValues } from "../schemas/vehicle.schema";

interface VehicleCreateFormProps {
  onSuccess?: () => void;
}

export function VehicleCreateForm({ onSuccess }: VehicleCreateFormProps) {
  const create = useCreateVehicle();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { isSuperAdmin } = useAuth();
  const { data: customers, isLoading: loadingCustomers } = useAllCustomers(
    isSuperAdmin ? undefined : activeBranch?.id,
  );

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateVehicleFormValues>({
    resolver: zodResolver(createVehicleSchema),
  });

  function onSubmit(values: CreateVehicleFormValues) {
    create.mutate(values, { onSuccess: () => { reset(); onSuccess?.(); } });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <Field label="Customer" error={errors.customerId?.message}>
        <select className={inputCls} {...register("customerId")}>
          <option value="">
            {loadingCustomers ? "Loading customers…" : "Select customer"}
          </option>
          {customers?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName} — {c.email}
            </option>
          ))}
        </select>
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
      <Button type="submit" disabled={create.isPending} className="mt-1">
        {create.isPending ? "Adding…" : "Add vehicle"}
      </Button>
    </form>
  );
}
