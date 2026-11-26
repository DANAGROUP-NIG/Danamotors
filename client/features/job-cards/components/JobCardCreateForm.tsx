"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Loader2, LockKeyhole, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { useVehicleWarranty } from "@/features/warranty/hooks/use-warranty";
import { WarrantyCheckPanel, ackRequiredCheck } from "@/features/warranty/components/WarrantyCheckPanel";
import type { WarrantyCheck } from "@/features/warranty/types/warranty.types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiGet } from "@/lib/api/apiClient";
import { formatDate, formatDateTime, formatKm, NOT_PROVIDED } from "@/lib/format";
import { getCustomerRequest } from "@/features/customers/api/customer.api";
import { getVehicleRequest } from "@/features/vehicles/api/vehicle.api";
import { OpeningRepeatCheck } from "@/features/repeat-jobs/components/OpeningRepeatCheck";
import { useRepeatPreview } from "@/features/repeat-jobs/hooks/use-repeat-jobs";
import { useCreateJobCard } from "../hooks/use-create-job-card";
import { jobCardErrorField } from "../schemas/job-card-error";
import { createJobCardSchema, type CreateJobCardFormValues } from "../schemas/job-card.schema";
import { WorkshopPicker, customerLabel, customerOption, type PickerRecord } from "./WorkshopPicker";
import { ServiceTypePicker } from "./ServiceTypePicker";
import { CustomerDetailsCard } from "./opening/CustomerDetailsCard";
import { CustomerRequestsTab, emptyRequest } from "./opening/CustomerRequestsTab";
import { OpeningCard, OpeningDatePicker, OpeningField, OpeningTimePicker, ReadOnlyField, localDate, openingGrid, openingInput } from "./opening/opening-ui";

/** The earliest promised date: the day after the booking or the opening, in Lagos. */
const getMinDate = (scheduledAt?: string | Date, openedAt?: string | Date): string => {
  const baseDate = new Date(scheduledAt ?? openedAt ?? Date.now());
  const nextDay = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(nextDay);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

function defaults(branchName: string, values?: Partial<CreateJobCardFormValues>): Partial<CreateJobCardFormValues> {
  return { branchName, serviceTypeId: "", complaints: [emptyRequest()], ...values };
}

/**
 * Opens a job card with only what is needed to create it: vehicle and mileage, customer, service
 * type, requests, promised delivery and the advisor receiving the vehicle. The job then starts at
 * check-in, where the advisor confirms the details, walks round the vehicle and takes the customer's
 * signature. Bay and technician are set by the workshop supervisor in Diagnosis.
 */
export function JobCardCreateForm({
  onSuccess,
  onClose,
  onDirtyChange,
  onPendingChange,
  defaultValues,
}: {
  onSuccess?: (id: string) => void;
  onClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  defaultValues?: Partial<CreateJobCardFormValues>;
}) {
  const create = useCreateJobCard();
  const { hasPermission, isSuperAdmin, isAdminOrAbove, user } = useAuth();
  const canSeeWarranty = isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.READ);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const branches = useBranchStore((s) => s.branches);
  const [openedAt] = useState(() => new Date());
  const initial = useRef(defaults(activeBranch?.name ?? "", defaultValues));

  const form = useForm<CreateJobCardFormValues>({
    resolver: zodResolver(createJobCardSchema),
    defaultValues: initial.current,
    mode: "onBlur",
  });
  const {
    register,
    control,
    setValue,
    setError,
    watch,
    reset,
    handleSubmit,
    formState: { errors, isDirty },
  } = form;
  const content = useRef<HTMLDivElement>(null);
  const hydratedVehicle = useRef<string | undefined>(undefined);
  const [customerId, vehicleId, appointmentId, branchName] = watch(["customerId", "vehicleId", "appointmentId", "branchName"]);
  const branchId = branches.find((branch) => branch.name === branchName)?.id ?? activeBranch?.id;

  const customerQuery = useQuery({ queryKey: ["job-opening-customer", customerId], queryFn: () => getCustomerRequest(customerId), enabled: !!customerId });
  const vehicleQuery = useQuery({ queryKey: ["job-opening-vehicle", vehicleId], queryFn: () => getVehicleRequest(vehicleId), enabled: !!vehicleId });
  const bookingQuery = useQuery({
    queryKey: ["job-opening-booking", appointmentId],
    queryFn: () => apiGet<{ appointment: PickerRecord }>(`/service/appointments/${appointmentId}`),
    enabled: !!appointmentId,
  });
  const customer = customerQuery.data;
  const vehicle = vehicleQuery.data?.vehicle;

  // Warranty and campaign check: runs once the vehicle and mileage are known. A covered vehicle
  // or an open campaign must be acknowledged before the job card is saved.
  const mileageValue = watch("mileage");
  const odometerReplaced = watch("odometerReplaced");
  const isRepeat = watch("isRepeat");
  const mileageNumber = Number.isInteger(mileageValue) && mileageValue >= 0 ? mileageValue : undefined;
  const debouncedMileage = useDebouncedValue(mileageNumber, 450);
  const warranty = useVehicleWarranty(vehicleId, debouncedMileage, canSeeWarranty && !!vehicleId && debouncedMileage !== undefined);
  const [serverCheck, setServerCheck] = useState<WarrantyCheck | null>(null);
  const check = serverCheck ?? warranty.data;
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    // A new check (vehicle or mileage changed) needs a fresh acknowledgement.
    setAcknowledged(false);
    setServerCheck(null);
  }, [vehicleId, debouncedMileage]);
  const needsAck = canSeeWarranty && Boolean(check?.requiresAcknowledgement) && !acknowledged;
  const lastJob = vehicle?.jobCards?.[0];
  const recentJobs = useQuery({
    queryKey: ["job-opening-recent-jobs", vehicleId, branchId, debouncedMileage],
    queryFn: () =>
      apiGet<{ jobs: { id: string; jobNumber: string; createdAt: string; technician?: { firstName: string; lastName: string } | null }[] }>(
        `/service/vehicles/${vehicleId}/recent-jobs?${new URLSearchParams({
          ...(branchId ? { branchId } : {}),
          ...(Number.isFinite(debouncedMileage) ? { mileage: String(debouncedMileage) } : {}),
        })}`,
      ),
    enabled: !!vehicleId && hasPermission("jobcard:read"),
  });
  const repeatPreview = useRepeatPreview(vehicleId, branchId, Number.isFinite(debouncedMileage) ? debouncedMileage : undefined, !!vehicleId && hasPermission("jobcard:read"));
  const repeatCandidate = repeatPreview.data?.candidate;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => {
    onPendingChange?.(create.isPending);
  }, [create.isPending, onPendingChange]);

  useEffect(() => {
    if (!vehicleId) {
      hydratedVehicle.current = undefined;
      return;
    }
    if (!vehicle || hydratedVehicle.current === vehicle.id) return;
    hydratedVehicle.current = vehicle.id;
    setValue("mileage", vehicle.lastRecordedMileage ?? Number.NaN);
  }, [vehicle, vehicleId, setValue]);

  const resetVehicle = () => {
    hydratedVehicle.current = undefined;
    setValue("vehicleId", "", { shouldDirty: true });
    setValue("mileage", Number.NaN);
    setValue("serviceId", "");
    setValue("odometerReplaced", false);
    setValue("odometerReplacedReason", "");
    setValue("isRepeat", false);
    setValue("previousJobId", "");
    setValue("repeatReason", "");
  };

  const applyBooking = (record: PickerRecord) => {
    resetVehicle();
    if (record.serviceTypeId) setValue("serviceTypeId", record.serviceTypeId);
    if (record.mileage != null) setValue("mileage", record.mileage);
    if (record.acFitted != null) setValue("acFitted", record.acFitted);
    if (record.requests?.length)
      setValue(
        "complaints",
        record.requests.map((row) => ({
          complaintCodeId: row.complaintCodeId ?? "",
          defectCode: row.defectCode ?? undefined,
          description: row.description,
          spare: Number(row.estimatedParts),
          oil: Number(row.estimatedOil),
          labour: Number(row.estimatedLabour),
        })),
      );
    setValue("customerId", record.customerId ?? "", { shouldDirty: true, shouldValidate: true });
    setValue("vehicleId", record.vehicleId ?? "", { shouldDirty: true, shouldValidate: true });
    if (record.branch && record.branch.name !== branchName) {
      setValue("branchName", record.branch.name, { shouldDirty: true });
      setValue("serviceAdvisorId", "");
    }
    if (record.serviceId) setValue("serviceId", record.serviceId, { shouldDirty: true, shouldValidate: true });
  };

  const minimumPromisedDate = getMinDate(bookingQuery.data?.appointment.scheduledAt, openedAt);
  const focusFirstProblem = () =>
    requestAnimationFrame(() => {
      content.current?.querySelectorAll<HTMLElement>('[aria-invalid="true"]').forEach((field) => {
        const card = field.closest("details");
        if (card) card.open = true;
      });
      content.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });

  const submit = handleSubmit(
    (values) => {
      if (create.isPending) return;
      if (values.promisedDate < minimumPromisedDate) {
        setError("promisedDate", { type: "min", message: `Choose ${formatDate(`${minimumPromisedDate}T12:00:00+01:00`)} or later for the promised date` });
        return;
      }
      if (needsAck) {
        toast.error("Tick the warranty and campaign acknowledgement before opening the job card.");
        return;
      }
      const { promisedDate, promisedTime, odometerReplaced: replaced, odometerReplacedReason, ...data } = values;
      create.mutate(
        {
          ...data,
          odometerReplaced: replaced || undefined,
          odometerReplacedReason: replaced ? odometerReplacedReason?.trim() : undefined,
          warrantyAcknowledged: acknowledged && check?.coverage.status === "ACTIVE",
          acknowledgedCampaignIds: acknowledged ? (check?.openCampaigns ?? []).map((c) => c.campaignId) : [],
          description: values.complaints.map((row) => row.description).join("; ").slice(0, 5000),
          promisedAt: new Date(`${promisedDate}T${promisedTime}:00+01:00`).toISOString(),
          previousJobId: values.isRepeat ? values.previousJobId : undefined,
          repeatReason: values.isRepeat ? values.repeatReason?.trim() || undefined : undefined,
          complaints: values.complaints.map((row) => ({ ...row, complaintCodeId: row.complaintCodeId || undefined })),
        },
        {
          onSuccess: (card) => {
            reset(values);
            onDirtyChange?.(false);
            toast.success(`Job card ${card.jobNumber} opened. Continue with check-in.`);
            if (card.warrantyCase) toast.success(`Warranty case ${card.warrantyCase.caseNumber} opened`);
            onSuccess?.(card.id);
          },
          onError: (error) => {
            if (isAxiosError(error)) {
              const response = error.response?.data;
              const fields: { field: string; message: string }[] =
                response?.errors ?? (response?.details?.field ? [{ field: response.details.field, message: response.message }] : []);
              for (const issue of fields)
                setError(jobCardErrorField(issue.field) as keyof CreateJobCardFormValues, { type: "server", message: issue.message });
              if (fields.length) focusFirstProblem();
            }
            const latest = ackRequiredCheck(error);
            if (latest) {
              // Coverage or campaigns changed since the check ran: show the server's view and ask again.
              setServerCheck(latest);
              setAcknowledged(false);
              toast.error("The warranty check changed. Review it and acknowledge again.");
              return;
            }
            toast.error(isAxiosError(error) ? error.response?.data?.message || "The job card was not opened. Try again." : "The job card was not opened. Try again.");
          },
        },
      );
    },
    () => focusFirstProblem(),
  );

  const loading = (!!customerId && customerQuery.isPending) || (!!vehicleId && vehicleQuery.isPending);

  return (
    <FormProvider {...form}>
      <form className="flex h-[calc(100dvh-10rem)] min-h-0 flex-col text-sm" onSubmit={submit} noValidate>
        <div className="contents" inert={create.isPending}>
          <header className="shrink-0 border-b border-border bg-background px-4 py-3 md:px-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1 text-sm font-medium">
                  <LockKeyhole className="h-3 w-3" aria-hidden="true" />
                  Job number assigned on save
                </span>
                <span className="text-sm text-muted-foreground">{formatDateTime(openedAt)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {repeatCandidate ? (
                  <span
                    title={`Back ${repeatCandidate.daysDifference} days after job ${repeatCandidate.previousJob.jobNumber}`}
                    className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-800"
                  >
                    Repeat job
                  </span>
                ) : lastJob ? (
                  <span title={`Last visit: ${formatDate(lastJob.createdAt)}`} className="rounded-full bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
                    Returning vehicle
                  </span>
                ) : null}
                {customer?.vip && <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary">VIP</span>}
                <span className="text-sm text-muted-foreground">{branchName || "Select a branch from the app header"}</span>
              </div>
            </div>
            <Controller
              name="appointmentId"
              control={control}
              render={({ field }) => (
                <WorkshopPicker
                  label="Booking (optional)"
                  endpoint={`/service/appointments?branchId=${branchId ?? ""}&status=BOOKED`}
                  collection="appointments"
                  value={field.value ?? ""}
                  selectedRecord={bookingQuery.data?.appointment}
                  disabled={!branchId || !hasPermission("appointment:update")}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  onSelect={applyBooking}
                />
              )}
            />
          </header>
          <div ref={content} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-muted/20 p-4 md:p-6">
            <p className="text-sm text-muted-foreground">
              Fill in what is needed to open the job. You confirm the details, walk round the vehicle and take the customer&apos;s signature at check-in.
            </p>
            {Object.keys(errors).length > 0 && (
              <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Check the fields marked in red before opening the job card.
                {errors.branchName && <span className="block">Select an active branch from the app header before opening a job.</span>}
              </div>
            )}

            <OpeningCard
              title="Vehicle"
              description="Search by registration or VIN. Saved vehicle details load automatically."
              action={
                vehicle && (
                  <Link href={`/vehicles/${vehicle.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary underline">
                    Edit vehicle record
                  </Link>
                )
              }
            >
              <div className={openingGrid}>
                <Controller
                  name="vehicleId"
                  control={control}
                  render={({ field }) => (
                    <WorkshopPicker
                      label="Registration or VIN"
                      required
                      endpoint="/vehicles"
                      collection="vehicles"
                      value={field.value ?? ""}
                      selectedRecord={vehicle}
                      error={errors.vehicleId?.message}
                      onBlur={field.onBlur}
                      onChange={(id) => {
                        resetVehicle();
                        field.onChange(id);
                        setValue("appointmentId", "");
                      }}
                      onSelect={(record) => setValue("customerId", record.customer?.id ?? record.customerId ?? "", { shouldDirty: true, shouldValidate: true })}
                    />
                  )}
                />
                <ReadOnlyField label="Model" value={[vehicle?.model, vehicle?.catalogue?.description || vehicle?.trim].filter(Boolean).join(", ")} />
                <ReadOnlyField label="Colour" value={vehicle?.color} />
                <OpeningField label="Mileage" required error={errors.mileage?.message}>
                  <div className="relative">
                    <input aria-invalid={!!errors.mileage} type="number" min={0} step="1" inputMode="numeric" className={`${openingInput} pr-10 tabular-nums`} {...register("mileage", { valueAsNumber: true })} />
                    <span className="absolute right-3 top-3 text-sm text-muted-foreground">km</span>
                  </div>
                  {vehicle && (
                    <span className="text-xs font-normal text-muted-foreground">
                      Last recorded {vehicle.lastRecordedMileage == null ? NOT_PROVIDED.toLowerCase() : formatKm(vehicle.lastRecordedMileage)}. The reading cannot go lower unless the odometer was replaced.
                    </span>
                  )}
                </OpeningField>
              </div>
              {vehicle && (
                <div className="mt-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-primary" {...register("odometerReplaced")} />
                    Odometer was replaced
                  </label>
                  {odometerReplaced && (
                    <OpeningField label="Reason for the odometer replacement" required error={errors.odometerReplacedReason?.message}>
                      <input className={openingInput} maxLength={300} aria-invalid={!!errors.odometerReplacedReason} placeholder="For example: instrument cluster replaced" {...register("odometerReplacedReason")} />
                    </OpeningField>
                  )}
                </div>
              )}
              <div className="mt-4">
                <Controller
                  name="serviceTypeId"
                  control={control}
                  render={({ field }) => (
                    <ServiceTypePicker
                      canConfigure={isAdminOrAbove}
                      vehicleId={vehicleId}
                      date={localDate(openedAt)}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      onCharge={() => undefined}
                      error={errors.serviceTypeId?.message}
                    />
                  )}
                />
              </div>
              {vehicleId && vehicleQuery.isPending && (
                <p role="status" className="mt-3 text-sm text-muted-foreground">
                  Loading vehicle details
                </p>
              )}
              {vehicleQuery.isError && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  Vehicle details could not be loaded.{" "}
                  <button type="button" className="underline" onClick={() => vehicleQuery.refetch()}>
                    Try again
                  </button>
                </p>
              )}
            </OpeningCard>

            {vehicleId && (
              <OpeningCard
                title="Warranty and campaign check"
                description="Runs before the job card is saved. A covered vehicle or an open campaign must be acknowledged."
                action={warranty.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Checking warranty" /> : undefined}
              >
                {canSeeWarranty ? (
                  <WarrantyCheckPanel
                    check={debouncedMileage !== undefined ? check : undefined}
                    isFetching={warranty.isFetching}
                    isError={warranty.isError}
                    acknowledged={acknowledged}
                    onAcknowledgedChange={setAcknowledged}
                    acknowledgedBy={user ? `${user.firstName} ${user.lastName}` : undefined}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">You do not have access to warranty information.</p>
                )}
              </OpeningCard>
            )}

            <CustomerDetailsCard
              customer={customer}
              loading={!!customerId && customerQuery.isPending}
              error={customerQuery.isError}
              retry={() => void customerQuery.refetch()}
              lookup={
                <Controller
                  name="customerId"
                  control={control}
                  render={({ field }) => (
                    <WorkshopPicker
                      label="Customer (bill to)"
                      required
                      endpoint="/customers"
                      collection="customers"
                      value={field.value ?? ""}
                      selectedRecord={customer}
                      error={errors.customerId?.message}
                      formatLabel={customerLabel}
                      renderOption={customerOption}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                    />
                  )}
                />
              }
            />

            {vehicleId && !!recentJobs.data?.jobs.length && (
              <OpeningCard title="Repeat visit" description="This vehicle was in recently. Mark the job as a repeat if the same problem is back.">
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Latest:{" "}
                    <Link href={`/job-cards/${recentJobs.data.jobs[0].id}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      {recentJobs.data.jobs[0].jobNumber}
                    </Link>{" "}
                    ({formatDate(recentJobs.data.jobs[0].createdAt)}).
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-primary" {...register("isRepeat")} />
                    This is a repeat job
                  </label>
                  {isRepeat && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <OpeningField label="Previous job" required error={errors.previousJobId?.message}>
                        <select className={openingInput} aria-invalid={!!errors.previousJobId} {...register("previousJobId")}>
                          <option value="">Select the previous job</option>
                          {recentJobs.data.jobs.map((job) => (
                            <option key={job.id} value={job.id}>
                              {job.jobNumber}, {formatDate(job.createdAt)}
                              {job.technician ? `, ${job.technician.firstName} ${job.technician.lastName}` : ""}
                            </option>
                          ))}
                        </select>
                      </OpeningField>
                      <OpeningField label="Repeat note (optional)" error={errors.repeatReason?.message}>
                        <textarea className={`${openingInput} h-20 py-2`} maxLength={2000} {...register("repeatReason")} />
                      </OpeningField>
                    </div>
                  )}
                </div>
              </OpeningCard>
            )}
            {vehicleId && recentJobs.isError && (
              <p role="alert" className="text-sm text-destructive">
                Recent jobs could not be loaded.{" "}
                <button type="button" className="underline" onClick={() => recentJobs.refetch()}>
                  Try again
                </button>
              </p>
            )}
            {vehicleId && hasPermission("jobcard:read") && (
              <OpeningRepeatCheck vehicleId={vehicleId} branchId={branchId} mileage={Number.isFinite(debouncedMileage) ? debouncedMileage : undefined} />
            )}

            <CustomerRequestsTab lastJobId={lastJob?.id} showAmounts={false} description="What the customer wants done. Add one line for each request. Pick a code if one fits." />

            <OpeningCard title="Promised delivery and advisor">
              <div className={openingGrid}>
                <Controller
                  name="promisedDate"
                  control={control}
                  render={({ field }) => (
                    <OpeningField label="Promised date" required error={errors.promisedDate?.message}>
                      <OpeningDatePicker value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.promisedDate} min={minimumPromisedDate} />
                    </OpeningField>
                  )}
                />
                <Controller
                  name="promisedTime"
                  control={control}
                  render={({ field }) => (
                    <OpeningField label="Promised time" required error={errors.promisedTime?.message}>
                      <OpeningTimePicker value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.promisedTime} />
                    </OpeningField>
                  )}
                />
                <Controller
                  name="serviceAdvisorId"
                  control={control}
                  render={({ field }) => (
                    <WorkshopPicker
                      label="Received by (service advisor)"
                      required
                      endpoint={`/service/staff?role=ServiceAdviser&branchId=${branchId ?? ""}`}
                      collection="users"
                      disabled={!branchId}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      error={errors.serviceAdvisorId?.message}
                    />
                  )}
                />
              </div>
            </OpeningCard>
          </div>
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-background px-4 py-3 md:px-6">
            {needsAck && <p className="mr-auto text-sm text-muted-foreground">Acknowledge the warranty and campaign check to open the job card.</p>}
            <Button type="button" variant="outline" disabled={create.isPending} onClick={onClose}>
              <X className="mr-1 h-4 w-4" aria-hidden="true" />
              Close
            </Button>
            <Button type="submit" disabled={!isDirty || create.isPending || needsAck || loading || customerQuery.isError || vehicleQuery.isError}>
              {create.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              {create.isPending ? "Opening job card" : "Open job card"}
            </Button>
          </footer>
        </div>
      </form>
    </FormProvider>
  );
}
