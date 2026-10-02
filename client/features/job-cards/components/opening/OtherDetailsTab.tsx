"use client";
import { Controller, useFormContext } from "react-hook-form";
import type { CreateJobCardFormValues } from "../../schemas/job-card.schema";
import { WorkshopPicker } from "../WorkshopPicker";
import { OpeningCard, OpeningField, openingInput, openingLabels } from "./opening-ui";

export function OtherDetailsTab() {
  const {
    register,
    control,
    watch,

    formState: {
      errors,
    },
  } = useFormContext<CreateJobCardFormValues>();

  const tyres = watch("tyres");

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2"><OpeningCard title="Tyre details" description="Record the make and identification number for each tyre."><div className="space-y-4">{openingLabels.tyres.map(
              (label, index) => <div key={label} className="rounded-lg border border-border p-3"><h4 className="mb-3 text-xs font-semibold text-muted-foreground">{label}</h4><div className="grid gap-3 sm:grid-cols-2"><Controller
                    name={`tyres.${index}.makeId`}
                    control={control}
                    render={(
                      {
                        field,
                      },
                    ) => <WorkshopPicker
                      label={`${label} make`}
                      endpoint="/workshop-masters?kind=TYRE_MAKE"
                      collection="items"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur} />} /><OpeningField label={`${label} number`} error={errors.tyres?.[index]?.number?.message}><input
                      className={`${openingInput} font-mono uppercase`}
                      maxLength={100}
                      {...register(`tyres.${index}.number`, {
                        setValueAs: value => value.toUpperCase(),
                      })} /></OpeningField></div>{tyres[index]?.number && !tyres[index]?.makeId && <p role="status" className="mt-2 text-xs text-muted-foreground">Select a tyre make.</p>}</div>,
            )}</div></OpeningCard></div>
      <div className="space-y-5"><OpeningCard title="Battery details"><div className="space-y-4"><Controller
              name="batteryMakeId"
              control={control}
              render={(
                {
                  field,
                },
              ) => <WorkshopPicker
                label="Battery make"
                endpoint="/workshop-masters?kind=BATTERY_MAKE"
                collection="items"
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur} />} /><OpeningField label="Battery number" error={errors.batteryNumber?.message}><input
                className={`${openingInput} font-mono uppercase`}
                maxLength={100}
                {...register("batteryNumber", {
                  setValueAs: value => value.toUpperCase(),
                })} /></OpeningField></div></OpeningCard><OpeningCard title="Additional information"><OpeningField label={openingLabels.customField} error={errors.customField1?.message}><input className={openingInput} maxLength={500} {...register("customField1")} /></OpeningField></OpeningCard></div>
    </div>
  );
}
