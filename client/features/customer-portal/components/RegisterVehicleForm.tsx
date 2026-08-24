"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useRegisterPortalVehicle } from "../hooks/use-portal-mutations";
import {
  registerPortalVehicleSchema,
  type RegisterPortalVehicleFormValues,
} from "../schemas/portal.schema";

interface RegisterVehicleFormProps {
  onSuccess?: () => void;
}

export function RegisterVehicleForm({ onSuccess }: RegisterVehicleFormProps) {
  const registerVehicle = useRegisterPortalVehicle();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RegisterPortalVehicleFormValues>({
    resolver: zodResolver(registerPortalVehicleSchema),
  });

  function onSubmit(values: RegisterPortalVehicleFormValues) {
    registerVehicle.mutate(
      {
        vin: values.vin,
        registrationNumber: values.registrationNumber || undefined,
        make: values.make || undefined,
        model: values.model || undefined,
        year: values.year ? Number(values.year) : undefined,
        trim: values.trim || undefined,
        color: values.color || undefined,
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
      <Field label="VIN" error={errors.vin?.message}>
        <input
          className={inputCls}
          placeholder="Vehicle Identification Number"
          {...register("vin")}
        />
      </Field>
      <Field label="Registration number (Reg No)" error={errors.registrationNumber?.message}>
        <input
          className={inputCls}
          placeholder="e.g. KJA-837-AA"
          {...register("registrationNumber")}
        />
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
        <Field label="Trim" error={errors.trim?.message}>
          <input className={inputCls} placeholder="SE" {...register("trim")} />
        </Field>
        <Field label="Color" error={errors.color?.message}>
          <input className={inputCls} placeholder="Silver" {...register("color")} />
        </Field>
      </div>
      <Button type="submit" disabled={registerVehicle.isPending} className="mt-1">
        {registerVehicle.isPending ? "Registering…" : "Register vehicle"}
      </Button>
    </form>
  );
}
