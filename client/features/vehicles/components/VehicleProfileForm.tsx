"use client";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { VehicleModelFields, type ModelSelection } from "./VehicleModelFields";
import { VehicleCustomerField } from "./VehicleCustomerField";
import { createVehicleSchema, vehicleProfileSchema, type CreateVehicleFormValues } from "../schemas/vehicle.schema";
import type { Vehicle } from "../types/vehicle.types";

export function VehicleProfileForm(
  {
    vehicle,
    onSubmit,
    pending,
    failed,
  }: {
    vehicle?: Vehicle;
    onSubmit: (values: CreateVehicleFormValues) => void;
    pending: boolean;
    failed: boolean;
  },
) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,

    formState: {
      errors,
    },
  } = useForm<CreateVehicleFormValues>({
    resolver: zodResolver(vehicle ? vehicleProfileSchema : createVehicleSchema),

    defaultValues: vehicle ? {
      vin: vehicle.vin,
      registrationNumber: vehicle.registrationNumber ?? "",
      modelId: vehicle.modelId ?? null,
      generationId: vehicle.generationId ?? null,
      engineId: vehicle.engineId ?? null,
      customMake: vehicle.customMake ?? vehicle.make ?? "",
      customModel: vehicle.modelId ? null : vehicle.customModel || vehicle.model || "Unspecified (legacy)",
      color: vehicle.color ?? "",
      engineNumber: vehicle.engineNumber ?? "",
      keyNumber: vehicle.keyNumber ?? "",
      pdiDone: vehicle.pdiDone,
      pdiDate: vehicle.pdiDate?.slice(0, 10) ?? "",
      saleDate: vehicle.saleDate?.slice(0, 10) ?? "",
      sellingDealer: vehicle.sellingDealer ?? "",
      year: vehicle.year ?? undefined,
    } : {},
  });

  const selection: ModelSelection = {
    modelId: watch("modelId"), generationId: watch("generationId"), engineId: watch("engineId"), customModel: watch("customModel"), customMake: watch("customMake"),
  };
  function updateSelection(next: ModelSelection) {
    for (const key of ["modelId", "generationId", "engineId", "customModel", "customMake"] as const) setValue(key, next[key], { shouldDirty: true, shouldValidate: true });
  }
  return (
    <form className="grid gap-4" onSubmit={handleSubmit(values => {
      const payload = { ...values };
      if (vehicle && (values.modelId ?? null) === (vehicle.modelId ?? null) && (values.generationId ?? null) === (vehicle.generationId ?? null) && (values.engineId ?? null) === (vehicle.engineId ?? null) && (values.customModel || null) === (vehicle.modelId ? null : vehicle.customModel || vehicle.model || "Unspecified (legacy)") && (values.customMake || null) === (vehicle.customMake || vehicle.make || null)) {
        delete payload.modelId; delete payload.generationId; delete payload.engineId; delete payload.customModel; delete payload.customMake;
      }
      onSubmit(payload);
    })}>
      {vehicle ? (
        <VehicleCustomerField value={vehicle.customer?.id} readOnly />
      ) : (
        <Controller
          name="customerId"
          control={control}
          render={({ field }) => (
            <VehicleCustomerField
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.customerId?.message}
              disabled={pending}
            />
          )}
        />
      )}
      <Field label="VIN"><input className={inputCls} readOnly={!!vehicle} {...register("vin")} /></Field>
      <Field label="Registration (optional)"><input className={inputCls} {...register("registrationNumber")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><VehicleModelFields value={selection} onChange={updateSelection} selectedName={vehicle?.model} error={errors.customModel?.message || errors.modelId?.message} /></div>
        <Field label="Colour (optional)"><input className={inputCls} {...register("color")} /></Field>
        {(["engineNumber", "keyNumber", "sellingDealer"] as const).map(key => <Field
          key={key}
          label={{
            engineNumber: "Engine number",
            keyNumber: "Key number",
            sellingDealer: "Selling dealer",
          }[key]}><input className={inputCls} {...register(key)} /></Field>)}
        <Field label="Year"><input
            type="number"
            className={inputCls}
            {...register("year", {
              setValueAs: (value: string) => value === "" ? undefined : Number(value),
            })} /></Field>
        <Field label="Sale date"><input type="date" className={inputCls} {...register("saleDate")} /></Field>
        <Field label="PDI date"><input type="date" className={inputCls} {...register("pdiDate")} /></Field>
        <label><input type="checkbox" {...register("pdiDone")} />PDI done</label>
      </div>
      {Object.entries(errors).map(([key, error]) => <p key={key} role="alert" className="text-sm text-red-600">{error.message}</p>)}
      {failed && <p role="alert" className="text-sm text-red-600">Could not save vehicle. Check the customer, VIN, registration and catalogue selections.</p>}
      <Button disabled={pending}>{pending ? "Saving..." : "Save vehicle"}</Button>
    </form>
  );
}
