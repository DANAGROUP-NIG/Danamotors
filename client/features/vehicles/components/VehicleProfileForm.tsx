"use client";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { VehicleIdentityFields, type VehicleIdentitySelection } from "./VehicleIdentityFields";
import { VehicleCustomerField } from "./VehicleCustomerField";
import { useVehicleModels } from "@/features/warranty/hooks/use-warranty";
import { createVehicleSchema, vehicleProfileSchema, type CreateVehicleFormValues } from "../schemas/vehicle.schema";
import type { Vehicle } from "../types/vehicle.types";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";

const money = [["purchaseAmount", "Purchase amount"], ["saleAmount", "Sale invoice amount"]] as const;
const numberOrUndefined = (value: string) => value === "" ? undefined : Number(value);
const day = (value?: string | null) => value?.slice(0, 10) || null;
const blankToNull = (value: string) => value || null;

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
  const { data: warrantyModels = [] } = useVehicleModels();
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
      catalogueId: vehicle.catalogueId ?? null,
      colourId: vehicle.colourId ?? null,
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
      vehicleModelId: vehicle.vehicleModelId ?? "",
      colourType: vehicle.colourType ?? null,
      parkedAt: vehicle.parkedAt ?? null,
      purchaseAmount: vehicle.purchaseAmount ?? undefined,
      saleInvoiceNumber: vehicle.saleInvoiceNumber ?? "",
      saleInvoiceDate: day(vehicle.saleInvoiceDate),
      saleAmount: vehicle.saleAmount ?? undefined,
      wcoNumber: vehicle.wcoNumber ?? "",
      wcoDate: day(vehicle.wcoDate),
      principalInvoiceNumber: vehicle.principalInvoiceNumber ?? "",
      principalInvoiceDate: day(vehicle.principalInvoiceDate),
      theft: vehicle.theft ?? false,
      manufactureMonth: vehicle.manufactureMonth ?? undefined,
      manufactureYear: vehicle.manufactureYear ?? undefined,
      tyres: vehicle.tyres ?? [],
      batteryNumber: vehicle.batteryNumber ?? "",
    } : {},
  });

  const catalogueId = watch("catalogueId");
  function updateIdentity(next: VehicleIdentitySelection) {
    for (const key of ["catalogueId", "colourId", "modelId", "generationId", "engineId", "customModel", "customMake"] as const) {
      setValue(key, next[key], { shouldDirty: true, shouldValidate: true });
    }
  }
  return (
    <form className="grid gap-4" onSubmit={handleSubmit(values => {
      const { tyres, batteryMakeId, ...rest } = values;
      const fitted = (tyres ?? []).filter((tyre): tyre is NonNullable<typeof tyre> => !!(tyre?.makeId || tyre?.number?.trim()))
        .map(tyre => ({ makeId: tyre.makeId || undefined, number: tyre.number?.trim() || undefined }));
      const payload: CreateVehicleFormValues = {
        ...rest,
        ...(fitted.length || vehicle?.tyres?.length ? { tyres: fitted } : {}),
        ...(batteryMakeId ? { batteryMakeId } : {}),
      };
      const unchangedCatalogue = vehicle && (values.catalogueId ?? null) === (vehicle.catalogueId ?? null) && (values.colourId ?? null) === (vehicle.colourId ?? null);
      const unchangedModel = vehicle && ['modelId', 'generationId', 'engineId', 'customModel', 'customMake'].every(key => {
        const field = key as keyof VehicleIdentitySelection;
        const initial = field === 'customMake' ? vehicle.customMake ?? vehicle.make ?? ''
          : field === 'customModel' ? vehicle.modelId ? null : vehicle.customModel || vehicle.model || 'Unspecified (legacy)'
          : vehicle[field] ?? null;
        return (values[field] || null) === (initial || null);
      });
      if (values.catalogueId || (unchangedCatalogue && unchangedModel)) {
        delete payload.modelId; delete payload.generationId; delete payload.engineId; delete payload.customModel; delete payload.customMake;
      }
      if (unchangedCatalogue) { delete payload.catalogueId; delete payload.colourId; }
      if (values.catalogueId) delete payload.color;
      if (vehicle && (values.vehicleModelId || null) === (vehicle.vehicleModelId ?? null)) delete payload.vehicleModelId;
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
        <div className="sm:col-span-2"><VehicleIdentityFields value={{ catalogueId, colourId: watch('colourId'), modelId: watch('modelId'), generationId: watch('generationId'), engineId: watch('engineId'), customModel: watch('customModel'), customMake: watch('customMake') }}
          selectedName={vehicle?.model} disabled={pending} onChange={updateIdentity}
          modelError={errors.modelId?.message || errors.customModel?.message} catalogueError={errors.catalogueId?.message} colourError={errors.colourId?.message} />
          {vehicle && !catalogueId && <p className="mt-2 text-sm text-muted-foreground">Current vehicle: {[vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" / ")}. Choose a model above to update its specifications.</p>}
        </div>
        {!catalogueId && <Field label="Colour (optional)"><input className={inputCls} {...register('color')} /></Field>}
        <Field label="Warranty policy model">
          <select className={inputCls} {...register("vehicleModelId")}>
            <option value="">Not linked</option>
            {warrantyModels.map(model => <option key={model.id} value={model.id}>{model.make} {model.name} ({model.code})</option>)}
          </select>
        </Field>
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
        <Field label="Sale date (warranty start)"><input type="date" className={inputCls} {...register("saleDate")} /></Field>
        <Field label="PDI date"><input type="date" className={inputCls} {...register("pdiDate")} /></Field>
        <label><input type="checkbox" {...register("pdiDone")} />PDI done</label>
      </div>
      <details className="rounded-lg border p-4" open={!!vehicle?.saleInvoiceNumber || !!vehicle?.tyres?.length}>
        <summary className="cursor-pointer text-sm font-semibold">Sale, stock and fitment</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Controller name="colourType" control={control} render={({ field }) => <WorkshopPicker label="Colour type" endpoint="/workshop-masters?kind=COLOUR_TYPE"
            collection="items" value={field.value ?? ""} getOptionId={row => row.code ?? row.id} onChange={code => field.onChange(code || null)} />} />
          <Field label="Vehicle parked at"><select className={inputCls} {...register("parkedAt", { setValueAs: blankToNull })}>
            <option value="">Not set</option><option value="SHOWROOM">Showroom</option><option value="STOCKYARD">Stockyard</option><option value="SOLD">Sold</option>
          </select></Field>
          {money.map(([key, label]) => <Field key={key} label={label}><input type="number" min="0" step="0.01" className={inputCls}
            {...register(key, { setValueAs: numberOrUndefined })} /></Field>)}
          {(["saleInvoiceNumber", "wcoNumber", "principalInvoiceNumber"] as const).map(key => <Field key={key}
            label={{ saleInvoiceNumber: "Sale invoice number", wcoNumber: "WCO number", principalInvoiceNumber: "Principal company invoice number" }[key]}>
            <input className={inputCls} {...register(key)} /></Field>)}
          {(["saleInvoiceDate", "wcoDate", "principalInvoiceDate"] as const).map(key => <Field key={key}
            label={{ saleInvoiceDate: "Sale invoice date", wcoDate: "WCO date", principalInvoiceDate: "Principal company invoice date" }[key]}>
            <input type="date" className={inputCls} {...register(key, { setValueAs: blankToNull })} /></Field>)}
          <Field label="Manufacture month"><input type="number" min="1" max="12" className={inputCls} {...register("manufactureMonth", { setValueAs: numberOrUndefined })} /></Field>
          <Field label="Manufacture year"><input type="number" min="1900" max="2200" className={inputCls} {...register("manufactureYear", { setValueAs: numberOrUndefined })} /></Field>
          <label className="flex gap-2"><input type="checkbox" {...register("theft")} />Theft vehicle</label>
        </div>
        <div className="mt-4 grid gap-3">
          {[0, 1, 2, 3, 4].map(index => <div key={index} className="grid gap-3 sm:grid-cols-2">
            <Controller name={`tyres.${index}.makeId`} control={control} render={({ field }) => <WorkshopPicker label={`Tyre ${index + 1} make`}
              endpoint="/workshop-masters?kind=TYRE_MAKE" collection="items" value={field.value ?? ""} onChange={field.onChange}
              selectedRecord={vehicle?.tyres?.[index]?.makeId ? { id: vehicle.tyres[index].makeId, description: vehicle.tyres[index].make } : undefined} />} />
            <Field label={`Tyre ${index + 1} number`}><input className={inputCls} {...register(`tyres.${index}.number`)} /></Field>
          </div>)}
          <div className="grid gap-3 sm:grid-cols-2">
            <Controller name="batteryMakeId" control={control} render={({ field }) => <WorkshopPicker label={`Battery make${vehicle?.batteryMake ? ` (now ${vehicle.batteryMake})` : ""}`}
              endpoint="/workshop-masters?kind=BATTERY_MAKE" collection="items" value={field.value ?? ""} onChange={field.onChange} />} />
            <Field label="Battery number"><input className={inputCls} {...register("batteryNumber")} /></Field>
          </div>
        </div>
      </details>
      {Object.entries(errors).map(([key, error]) => <p key={key} role="alert" className="text-sm text-red-600">{error.message}</p>)}
      {failed && <p role="alert" className="text-sm text-red-600">Could not save vehicle. Check the customer, VIN, registration and catalogue selections.</p>}
      <Button disabled={pending}>{pending ? "Saving..." : "Save vehicle"}</Button>
    </form>
  );
}
