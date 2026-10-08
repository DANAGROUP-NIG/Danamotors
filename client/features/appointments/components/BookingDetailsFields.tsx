"use client";

import { Controller, useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { blankToUndefined, type BookingRequestValue } from "../schemas/appointment.schema";

/** The part of the create and edit forms these fields bind to. */
export type BookingFields = { serviceTypeId?: string; requests?: BookingRequestValue[] };

/** Workshop service type (paid service, free service, running repair…) the vehicle is booked for. */
export function ServiceTypeField({ control, error }: { control: Control<BookingFields>; error?: string }) {
  return (
    <Controller
      name="serviceTypeId"
      control={control}
      render={({ field }) => (
        <WorkshopPicker
          label="Service type"
          endpoint="/workshop-masters?kind=SERVICE_TYPE"
          collection="items"
          value={field.value ?? ""}
          onChange={field.onChange}
          onBlur={field.onBlur}
          error={error}
        />
      )}
    />
  );
}

/** What the customer asked for, with estimated parts, labour and oil (legacy booking requests). */
export function BookingRequestsEditor({
  control,
  register,
  errors,
}: {
  control: Control<BookingFields>;
  register: UseFormRegister<BookingFields>;
  errors?: FieldErrors<BookingFields>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "requests" });
  const money = "h-10 w-full min-w-0 rounded-md border border-border bg-background px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring";

  return (
    <fieldset className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <legend className="text-sm font-semibold">Booking requests</legend>
        <Button type="button" variant="outline" size="sm" onClick={() => append({ description: "" })} disabled={fields.length >= 30}>
          <Plus className="size-4" />
          Add request
        </Button>
      </div>
      {fields.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">No requests yet. Add what the customer wants done.</p>
      ) : (
        <div className="grid gap-3">
          {fields.map((item, index) => {
            const rowErrors = errors?.requests?.[index];
            return (
              <div key={item.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_repeat(3,minmax(0,0.7fr))_auto] sm:items-end">
                <Controller
                  name={`requests.${index}.complaintCodeId`}
                  control={control}
                  render={({ field }) => (
                    <WorkshopPicker
                      label="Complaint code"
                      endpoint="/workshop-masters?kind=COMPLAINT"
                      collection="items"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
                <label className="grid gap-1.5">
                  <span className="text-sm font-semibold">Request</span>
                  <input className={inputCls} placeholder="e.g. AC not cooling" {...register(`requests.${index}.description`)} aria-invalid={Boolean(rowErrors?.description)} />
                  {rowErrors?.description && <span className="text-sm text-red-500">{rowErrors.description.message}</span>}
                </label>
                {(["estimatedParts", "estimatedLabour", "estimatedOil"] as const).map((key) => (
                  <label key={key} className="grid gap-1.5">
                    <span className="text-sm font-semibold">{key === "estimatedParts" ? "Parts ₦" : key === "estimatedLabour" ? "Labour ₦" : "Oil ₦"}</span>
                    <input type="number" min={0} step="0.01" className={money} {...register(`requests.${index}.${key}`, { setValueAs: blankToUndefined })} />
                  </label>
                ))}
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} aria-label={`Remove request ${index + 1}`}>
                  <Trash2 className="size-4 text-red-500" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

/** Drop empty optional values before sending the requests to the API. */
export function cleanRequests(requests: BookingRequestValue[] | undefined) {
  return (requests ?? []).map((request) => ({
    description: request.description.trim(),
    complaintCodeId: request.complaintCodeId || undefined,
    estimatedParts: request.estimatedParts ?? 0,
    estimatedLabour: request.estimatedLabour ?? 0,
    estimatedOil: request.estimatedOil ?? 0,
  }));
}
