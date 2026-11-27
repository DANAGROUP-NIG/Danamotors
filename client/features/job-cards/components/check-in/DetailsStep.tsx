"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOT_PROVIDED } from "@/lib/format";
import { customerName, vehicleTitle, type JobFileTab } from "../../lib/job-frame.logic";
import {
  detailsAlerts,
  detailsDefaults,
  lagosToday,
  previousReadingText,
  type DetailsValues,
} from "../../lib/check-in.logic";
import { checkInDetailsSchema } from "../../schemas/check-in.schema";
import type { JobCard } from "../../types/job-card.types";
import type { JobCheckIn } from "../../types/job-check-in.types";
import type { PreviousVisit } from "../../types/job-workspace.types";
import { CustomerRequestsTab } from "../opening/CustomerRequestsTab";
import { OpeningDatePicker, OpeningField, OpeningTimePicker, openingInput } from "../opening/opening-ui";
import { ServiceTypePicker } from "../ServiceTypePicker";
import { WorkshopPicker, customerLabel, customerOption, type PickerRecord } from "../WorkshopPicker";
import { DetailList, StageCard } from "../workspace/StageCard";
import type { DeclinedItem } from "../../types/job-estimate.types";
import { DeclinedItemsCard } from "../estimate/DeclinedItemsCard";

/**
 * Check-in Details: who and what, the visit details, the customer's requests and the
 * instructions to the technician. Submitting saves through PUT /check-in/details.
 */
export function DetailsStep({
  formId,
  job,
  checkIn,
  lastVisit,
  declinedItems,
  editable,
  onSubmit,
  serverErrors,
  onOpenTab,
}: {
  formId: string;
  job: JobCard;
  checkIn: JobCheckIn;
  lastVisit: PreviousVisit | null;
  /** Recommended work the customer declined on earlier visits, to offer again. */
  declinedItems: DeclinedItem[];
  editable: boolean;
  onSubmit: (values: DetailsValues) => void;
  /** Field errors from the last save, shown beside their fields. */
  serverErrors: { field: keyof DetailsValues; message: string }[];
  onOpenTab: (tab: JobFileTab) => void;
}) {
  const form = useForm<DetailsValues>({
    resolver: zodResolver(checkInDetailsSchema),
    defaultValues: detailsDefaults(job, checkIn),
    mode: "onTouched",
  });
  const {
    control,
    register,
    setError,
    formState: { errors },
  } = form;
  const odometerReplaced = useWatch({ control, name: "odometerReplaced" });

  useEffect(() => {
    for (const problem of serverErrors) setError(problem.field, { type: "server", message: problem.message }, { shouldFocus: true });
  }, [serverErrors, setError]);

  const alerts = detailsAlerts(job, lastVisit, checkIn.serviceHistory);
  const reading = previousReadingText(checkIn.previousReading);
  const billTo = job.customer as PickerRecord | undefined;
  const owner = checkIn.vehicleOwner;

  return (
    <div className="space-y-4">
      {declinedItems.length > 0 && <DeclinedItemsCard items={declinedItems} description="The customer declined this work on an earlier visit. Ask whether they want it done this time." />}
      {alerts.length > 0 && (
        <ul className="space-y-2" aria-label="Notes for this visit">
          {alerts.map((alert) => {
            const Icon = alert.tone === "info" ? Info : TriangleAlert;
            return (
              <li
                key={alert.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-2.5 text-sm",
                  alert.tone === "info" ? "border-blue-200 bg-blue-50 text-blue-900" : "border-amber-200 bg-amber-50 text-amber-900",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <p className="min-w-0 flex-1">{alert.message}</p>
                {alert.link && (
                  <button
                    type="button"
                    className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => alert.link && onOpenTab(alert.link.tab)}
                  >
                    {alert.link.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <FormProvider {...form}>
        <form id={formId} noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <fieldset disabled={!editable} className="min-w-0 space-y-4">
            <StageCard
              title="Customer and vehicle"
              actions={
                job.customer?.id ? (
                  <Link href={`/customers/${job.customer.id}`} className="text-sm font-semibold text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Edit customer
                  </Link>
                ) : undefined
              }
            >
              <DetailList
                rows={[
                  { label: "Name", value: customerName(job.customer) },
                  { label: "Phone", value: job.customer?.phoneNumber || NOT_PROVIDED },
                  { label: "Vehicle", value: vehicleTitle(job.vehicle) },
                  { label: "Plate", value: job.vehicle?.registrationNumber || NOT_PROVIDED },
                  { label: "VIN", value: <span className="break-all">{job.vehicle?.vin || NOT_PROVIDED}</span> },
                ]}
              />
              {editable ? (
                <Controller
                  name="customerId"
                  control={control}
                  render={({ field }) => (
                    <WorkshopPicker
                      label="Bill to"
                      required
                      endpoint="/customers"
                      collection="customers"
                      value={field.value ?? ""}
                      selectedRecord={billTo}
                      error={errors.customerId?.message}
                      formatLabel={(row) => `${customerLabel(row)}${owner && row.id === owner.id ? " (owner)" : ""}`}
                      renderOption={customerOption}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                    />
                  )}
                />
              ) : (
                <DetailList rows={[{ label: "Bill to", value: customerName(job.customer) }]} />
              )}
            </StageCard>

            <StageCard title="Visit details">
              <div className="grid gap-4 sm:grid-cols-2">
                <OpeningField label="Mileage" required error={errors.mileage?.message}>
                  <div className="flex">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className={cn(openingInput, "rounded-r-none tabular-nums")}
                      aria-invalid={!!errors.mileage}
                      {...register("mileage", { setValueAs: (value) => (value === "" || value === null ? undefined : Number(value)) })}
                    />
                    <span className="flex h-10 items-center rounded-r-lg border border-l-0 border-border bg-muted px-3 text-sm text-muted-foreground">km</span>
                  </div>
                  {reading && <span className="text-xs font-normal text-muted-foreground">{reading}</span>}
                </OpeningField>
                <Controller
                  name="serviceTypeId"
                  control={control}
                  render={({ field }) => (
                    <ServiceTypePicker
                      vehicleId={job.vehicle?.id}
                      date={lagosToday()}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      onCharge={() => undefined}
                      error={errors.serviceTypeId?.message}
                    />
                  )}
                />
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                <input type="checkbox" className="size-5 accent-primary" {...register("odometerReplaced")} />
                Odometer replaced (the reading can go below the last one)
              </label>
              {odometerReplaced && (
                <OpeningField label="Reason for the odometer replacement" required error={errors.odometerReplacedReason?.message}>
                  <input className={openingInput} maxLength={300} {...register("odometerReplacedReason")} />
                </OpeningField>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <OpeningField label="Promised delivery date" required error={errors.promisedDate?.message}>
                  <Controller
                    name="promisedDate"
                    control={control}
                    render={({ field }) => (
                      <OpeningDatePicker value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.promisedDate} min={lagosToday()} />
                    )}
                  />
                </OpeningField>
                <OpeningField label="Promised delivery time" required error={errors.promisedTime?.message}>
                  <Controller
                    name="promisedTime"
                    control={control}
                    render={({ field }) => <OpeningTimePicker value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.promisedTime} />}
                  />
                </OpeningField>
              </div>
            </StageCard>
          </fieldset>

          <fieldset disabled={!editable} className="min-w-0 space-y-4">
            <CustomerRequestsTab
              showLastVisit={false}
              showAmounts={false}
              description={job.appointment ? "Carried over from the booking. Add or change requests with the customer." : "What the customer wants done. Add one line for each request."}
            />
            <StageCard title="Instructions to technician" description="Visible to the workshop. Write what you want checked.">
              <OpeningField label="Instructions" error={errors.instructionsToTechnician?.message}>
                <textarea rows={4} maxLength={2000} className={cn(openingInput, "h-auto py-2")} {...register("instructionsToTechnician")} />
              </OpeningField>
            </StageCard>
          </fieldset>
        </form>
      </FormProvider>
    </div>
  );
}
