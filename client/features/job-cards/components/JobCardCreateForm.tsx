"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Download, LockKeyhole, MoreHorizontal, Plus, RotateCcw, Save, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiGet } from "@/lib/api/apiClient";
import { getCustomerRequest } from "@/features/customers/api/customer.api";
import { getVehicleRequest } from "@/features/vehicles/api/vehicle.api";
import { useCreateJobCard } from "../hooks/use-create-job-card";
import { createJobCardSchema, type CreateJobCardFormValues } from "../schemas/job-card.schema";
import { WorkshopPicker, type PickerRecord } from "./WorkshopPicker";
import { CustomerDetailsCard } from "./opening/CustomerDetailsCard";
import { CustomerRequestsTab, emptyRequest, requestTotals } from "./opening/CustomerRequestsTab";
import { OtherDetailsTab } from "./opening/OtherDetailsTab";

import {
  OpeningCard,
  OpeningField,
  ReadOnlyField,
  CurrencyInput,
  OpeningDatePicker,
  localDate,
  openingInput,
  openingGrid,
  formatDate,
  money,
} from "./opening/opening-ui";

const tabs = ["Vehicle Details", "Customer Requests", "Other Details"] as const;
type Tab = typeof tabs[number];

function defaults(branchName: string, values?: Partial<CreateJobCardFormValues>): Partial<CreateJobCardFormValues> {
  return {
    branchName,
    complaints: [emptyRequest()],

    tyres: Array.from({
      length: 5,
    }, () => ({
      makeId: "",
      number: "",
    })),

    serviceCharge: 0,
    ...values,
  };
}

export function JobCardCreateForm(
  {
    onSuccess,
    onClose,
    onDirtyChange,
    onPendingChange,
    defaultValues,
  }: {
    onSuccess?: () => void;
    onClose?: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onPendingChange?: (pending: boolean) => void;
    defaultValues?: Partial<CreateJobCardFormValues>;
  },
) {
  const create = useCreateJobCard();

  const {
    hasPermission,
  } = useAuth();

  const activeBranch = useBranchStore(s => s.activeBranch);
  const branches = useBranchStore(s => s.branches);
  const [openedAt, setOpenedAt] = useState(() => new Date());
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
    getValues,
    watch,
    reset,
    handleSubmit,

    formState: {
      errors,
      isDirty,
    },
  } = form;

  const [tab, setTab] = useState<Tab>("Vehicle Details");
  const [confirmation, setConfirmation] = useState<"new" | "undo" | "estimate" | null>(null);
  const [estimate, setEstimate] = useState<PickerRecord>();
  const [find, setFind] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirmation && !find)
      return;

    const previous = document.activeElement as HTMLElement | null;
    overlay.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => previous?.focus();
  }, [confirmation, find]);

  const hydratedVehicle = useRef<string | undefined>(undefined);
  const [customerId, vehicleId, appointmentId, branchName] = watch(["customerId", "vehicleId", "appointmentId", "branchName"]);
  const branchId = branches.find(branch => branch.name === branchName)?.id ?? activeBranch?.id;

  const customerQuery = useQuery({
    queryKey: ["job-opening-customer", customerId],
    queryFn: () => getCustomerRequest(customerId),
    enabled: !!customerId,
  });

  const vehicleQuery = useQuery({
    queryKey: ["job-opening-vehicle", vehicleId],
    queryFn: () => getVehicleRequest(vehicleId),
    enabled: !!vehicleId,
  });

  const bookingQuery = useQuery({
    queryKey: ["job-opening-booking", appointmentId],

    queryFn: () => apiGet<{
      appointment: PickerRecord;
    }>(`/service/appointments/${appointmentId}`),

    enabled: !!appointmentId,
  });

  const customer = customerQuery.data;
  const vehicle = vehicleQuery.data?.vehicle;
  const lastJob = vehicle?.jobCards?.[0];

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onPendingChange?.(create.isPending);
  }, [create.isPending, onPendingChange]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!vehicleId) {
      hydratedVehicle.current = undefined;
      return;
    }

    if (!vehicle || hydratedVehicle.current === vehicle.id)
      return;

    hydratedVehicle.current = vehicle.id;
    setValue("mileage", vehicle.lastRecordedMileage ?? Number.NaN);
    setValue("acType", vehicle.catalogue?.acFitted ? "FACTORY" : "NONE");
  }, [vehicle, vehicleId, setValue]);

  const resetVehicle = () => {
    hydratedVehicle.current = undefined;

    setValue("vehicleId", "", {
      shouldDirty: true,
    });

    setValue("mileage", Number.NaN);
    setValue("acType", "NONE");
  };

  const applyBooking = (record: PickerRecord) => {
    resetVehicle();

    setValue("customerId", record.customerId ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    });

    setValue("vehicleId", record.vehicleId ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    });

    if (record.branch && record.branch.name !== branchName) {
      setValue("branchName", record.branch.name, {
        shouldDirty: true,
      });

      setValue("serviceAdvisorId", "");
      setValue("technicianId", "");
    }
  };

  const applyEstimate = () => {
    if (!estimate?.lines?.length || estimate.currency !== "NGN") {
      toast.error("Select a priced NGN estimate with line items.");
      return;
    }

    resetVehicle();
    setValue("appointmentId", "");

    setValue("customerId", estimate.jobCard?.customer?.id ?? "", {
      shouldDirty: true,
    });

    setValue("vehicleId", estimate.jobCard?.vehicle?.id ?? "", {
      shouldDirty: true,
    });

    if (estimate.jobCard?.branch?.name) setValue("branchName", estimate.jobCard.branch.name, {
      shouldDirty: true,
    });

    setValue("serviceAdvisorId", "");
    setValue("technicianId", "");

    setValue("complaints", estimate.lines.map(line => ({
      ...emptyRequest(),
      defectCode: "9999999",
      description: line.description,
      spare: line.type === "PART" ? line.amount : 0,
      labour: line.type === "LABOUR" ? line.amount : 0,
    })), {
      shouldDirty: true,
      shouldValidate: true,
    });

    setValue("serviceCharge", 0, {
      shouldDirty: true,
    });

    setTab("Customer Requests");
    toast.success("Estimate lines loaded for review");
  };

  const resetForm = (kind: "new" | "undo") => {
    hydratedVehicle.current = undefined;

    if (kind === "new") {
      initial.current = defaults(activeBranch?.name ?? branchName);
      setOpenedAt(new Date());
    }

    reset(initial.current);
    setEstimate(undefined);
    setTab("Vehicle Details");
    create.reset();
  };

  const askReset = (kind: "new" | "undo") => {
    if (isDirty)
      setConfirmation(kind);
    else
      resetForm(kind);
  };

  const rows = watch("complaints");
  const totals = requestTotals(rows);
  const charge = watch("serviceCharge") ?? 0;
  const total = (Math.round(totals.spare * 100) + Math.round(totals.oil * 100) + Math.round(totals.labour * 100) + Math.round(charge * 100)) / 100;
  const otherErrors = ["tyres", "batteryMakeId", "batteryNumber", "customField1"];

  const countErrors = (target: Tab) => Object.keys(errors).filter(
    key => target === "Customer Requests" ? key === "complaints" : target === "Other Details" ? otherErrors.includes(key) : key !== "complaints" && !otherErrors.includes(key),
  ).length;

  const selectTab = (target: Tab) => {
    setTab(target);

    content.current?.scrollTo({
      top: 0,
    });
  };

  const submit = handleSubmit(values => {
    const {
      promisedDate,
      promisedTime,
      ...data
    } = values;

    create.mutate({
      ...data,
      description: values.complaints.map(row => row.description).join("; ").slice(0, 5000),
      promisedAt: new Date(`${promisedDate}T${promisedTime}`).toISOString(),
      technicianId: values.technicianId || undefined,
      teamId: values.teamId || undefined,
      estimatedParts: totals.spare,
      estimatedOil: totals.oil,
      estimatedLabour: totals.labour,
      batteryMakeId: values.batteryMakeId || undefined,

      tyres: values.tyres.map(tyre => ({
        makeId: tyre.makeId || undefined,
        number: tyre.number?.toUpperCase(),
      })),

      complaints: values.complaints.map(row => ({
        ...row,
        complaintCodeId: row.complaintCodeId || undefined,
      })),
    }, {
      onSuccess: () => {
        reset(values);
        onDirtyChange?.(false);
        toast.success("Job card opened");
        onSuccess?.();
      },

      onError: error => toast.error(
        isAxiosError(error) ? error.response?.data?.message || "Could not save job card" : "Could not save job card",
      ),
    });
  }, validation => {
    const key = Object.keys(validation)[0];

    selectTab(
      key === "complaints" ? "Customer Requests" : otherErrors.includes(key) ? "Other Details" : "Vehicle Details",
    );

    requestAnimationFrame(() => content.current?.querySelector<HTMLElement>("[aria-invalid=\"true\"]")?.focus());
  });

  const masterPicker = (name: "serviceTypeId" | "bayId" | "teamId", label: string, kind: string, required = false) => <Controller
    name={name}
    control={control}
    render={(
      {
        field,
      },
    ) => <WorkshopPicker
      label={label}
      required={required}
      endpoint={`/workshop-masters?kind=${kind}`}
      collection="items"
      value={field.value ?? ""}
      onChange={field.onChange}
      onBlur={field.onBlur}
      error={errors[name]?.message} />} />;

  const loading = (!!customerId && customerQuery.isPending) || (!!vehicleId && vehicleQuery.isPending);

  return (
    <FormProvider {...form}><form
        className="flex h-[calc(100dvh-10rem)] min-h-0 flex-col text-sm"
        onSubmit={submit}
        noValidate
        onKeyDown={event => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            setFind(true);
          }
        }}>
        <div className="contents" inert={!!(confirmation || find)}>
          <header className="shrink-0 border-b border-border bg-background px-4 py-3 md:px-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span
                  className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1 text-xs font-medium"><LockKeyhole className="h-3 w-3" />Job no. assigned on save</span><span className="text-xs text-muted-foreground">{formatDate(openedAt.toISOString())} <span className="px-1">/</span> {openedAt.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}</span></div><div className="flex flex-wrap gap-2">{lastJob && <span
                  title={`Last visit: ${formatDate(lastJob.createdAt)}`}
                  className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">Repeat visit</span>}{customer?.vip && <span
                  className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">VIP</span>}<span className="text-xs text-muted-foreground">{branchName || "Select a branch from the app header"}</span></div></div>
            <div className="grid gap-3 md:grid-cols-2"><div className="flex items-end gap-2"><div className="min-w-0 flex-1"><WorkshopPicker
                    label="Estimate"
                    endpoint={`/service/estimates?branchId=${branchId ?? ""}`}
                    collection="estimates"
                    value={estimate?.id ?? ""}
                    selectedRecord={estimate}
                    disabled={!branchId || !hasPermission("estimate:read")}
                    onChange={id => {
                      if (!id)
                        setEstimate(undefined);
                    }}
                    onSelect={setEstimate} /></div><Button
                  type="button"
                  variant="outline"
                  disabled={!estimate || create.isPending}
                  aria-label="Load selected estimate"
                  title="Load selected estimate"
                  onClick={() => {
                    if (isDirty)
                      setConfirmation("estimate");
                    else
                      applyEstimate();
                  }}><Download className="h-4 w-4" /></Button></div><Controller
                name="appointmentId"
                control={control}
                render={(
                  {
                    field,
                  },
                ) => <WorkshopPicker
                  label="Booking"
                  endpoint={`/service/appointments?branchId=${branchId ?? ""}`}
                  collection="appointments"
                  value={field.value ?? ""}
                  selectedRecord={bookingQuery.data?.appointment}
                  disabled={!branchId}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  onSelect={applyBooking} />} /></div>
          </header>
          <div
            role="tablist"
            aria-label="Job card sections"
            className="flex shrink-0 border-b border-border bg-muted/30 px-2 md:px-4">{tabs.map((label, index) => <button
              key={label}
              id={`job-opening-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={tab === label}
              aria-controls={`job-opening-panel-${index}`}
              tabIndex={tab === label ? 0 : -1}
              onClick={() => selectTab(label)}
              onKeyDown={event => {
                const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;

                if (direction) {
                  event.preventDefault();
                  const next = (index + direction + tabs.length) % tabs.length;
                  selectTab(tabs[next]);
                  document.getElementById(`job-opening-tab-${next}`)?.focus();
                }
              }}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:flex-none md:px-5 md:text-sm ${tab === label ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}{countErrors(label) > 0 && <span
                aria-label={`${countErrors(label)} field groups need attention`}
                className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground">{countErrors(label)}</span>}</button>)}</div>
          <div ref={content} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/20 p-4 md:p-6">
            {Object.keys(errors).length > 0 && <div
              role="alert"
              className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">Review the highlighted fields before saving.{errors.branchName && <span className="block">Select an active branch from the app header before opening a job.</span>}</div>}
            {create.isError && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{isAxiosError(create.error) ? create.error.response?.data?.message || "Could not save job card." : "Could not save job card."}</p>}
            <div
              role="tabpanel"
              id="job-opening-panel-0"
              aria-labelledby="job-opening-tab-0"
              hidden={tab !== "Vehicle Details"}
              className="space-y-5">
              <OpeningCard
                title="Vehicle"
                description="Search registration or VIN. Saved vehicle details load automatically."
                action={vehicle && <Link
                  href={`/vehicles/${vehicle.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary underline">Edit vehicle record</Link>}>
                <div className={openingGrid}><Controller
                    name="vehicleId"
                    control={control}
                    render={(
                      {
                        field,
                      },
                    ) => <WorkshopPicker
                      label="Regn no. / VIN"
                      required
                      endpoint={customerId ? `/vehicles?customerId=${customerId}` : "/vehicles"}
                      collection="vehicles"
                      value={field.value ?? ""}
                      selectedRecord={vehicle}
                      error={errors.vehicleId?.message}
                      onBlur={field.onBlur}
                      onChange={id => {
                        resetVehicle();
                        field.onChange(id);
                        setValue("appointmentId", "");
                      }}
                      onSelect={record => {
                        setValue("customerId", record.customer?.id ?? record.customerId ?? "", {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }} />} /><ReadOnlyField label="Variant" value={vehicle?.catalogue?.description || vehicle?.trim} /><ReadOnlyField label="Model" value={vehicle?.model} /><ReadOnlyField label="VIN" value={vehicle?.vin} /><ReadOnlyField label="Engine" value={vehicle?.engineNumber} /><OpeningField label="A/C"><select className={openingInput} {...register("acType")}><option value="NONE">None</option><option value="FACTORY">Factory fitted</option><option value="DEALER">Dealer fitted</option></select></OpeningField><ReadOnlyField label="Colour" value={vehicle?.color} /><ReadOnlyField label="Purchase dealer" value={vehicle?.sellingDealer} /><ReadOnlyField label="Purchase date" value={vehicle?.saleDate ? formatDate(vehicle.saleDate) : undefined} />{masterPicker("serviceTypeId", "Service", "SERVICE_TYPE", true)}<OpeningField label="Mileage" required error={errors.mileage?.message}><div className="relative"><input
                        aria-invalid={!!errors.mileage}
                        type="number"
                        min={vehicle?.lastRecordedMileage ?? 0}
                        step="1"
                        className={`${openingInput} pr-10 tabular-nums`}
                        {...register("mileage", {
                          valueAsNumber: true,
                        })} /><span className="absolute right-3 top-3 text-xs text-muted-foreground">km</span></div></OpeningField></div>
                {vehicle && <p className="mt-3 text-xs text-muted-foreground">Previous odometer: {vehicle.lastRecordedMileage?.toLocaleString() ?? "Not recorded"}km. The recorded mileage cannot decrease.</p>}
                {vehicleId && vehicleQuery.isPending && <p role="status" className="mt-3 text-xs text-muted-foreground">Loading vehicle details...</p>}{vehicleQuery.isError && <p role="alert" className="mt-3 text-xs text-destructive">Vehicle details could not be loaded. <button type="button" className="underline" onClick={() => vehicleQuery.refetch()}>Retry</button></p>}
              </OpeningCard>
              <CustomerDetailsCard
                customer={customer}
                loading={!!customerId && customerQuery.isPending}
                error={customerQuery.isError}
                retry={() => {
                  void customerQuery.refetch();
                }}
                lookup={<Controller
                  name="customerId"
                  control={control}
                  render={(
                    {
                      field,
                    },
                  ) => <WorkshopPicker
                    label="Existing customers"
                    required
                    endpoint="/customers"
                    collection="customers"
                    value={field.value ?? ""}
                    selectedRecord={customer}
                    error={errors.customerId?.message}
                    onBlur={field.onBlur}
                    onChange={id => {
                      field.onChange(id);
                      resetVehicle();
                      setValue("appointmentId", "");
                    }} />} />} />
              <OpeningCard title="Job scheduling & estimate"><div className={openingGrid}><Controller
                    name="promisedDate"
                    control={control}
                    render={(
                      {
                        field,
                      },
                    ) => <OpeningField label="Promised date" required error={errors.promisedDate?.message}><OpeningDatePicker
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        invalid={!!errors.promisedDate}
                        min={localDate(openedAt)} /></OpeningField>} /><OpeningField label="Promised time" required error={errors.promisedTime?.message}><input type="time" className={openingInput} {...register("promisedTime")} /></OpeningField>{masterPicker("teamId", "Group", "TEAM")}
                  <Controller
                    name="technicianId"
                    control={control}
                    render={(
                      {
                        field,
                      },
                    ) => <WorkshopPicker
                      label="Engineer"
                      endpoint={`/service/staff?role=Technician&branchId=${branchId ?? ""}`}
                      collection="users"
                      disabled={!branchId}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      error={errors.technicianId?.message} />} /><Controller
                    name="serviceAdvisorId"
                    control={control}
                    render={(
                      {
                        field,
                      },
                    ) => <WorkshopPicker
                      label="Received by"
                      required
                      endpoint={`/service/staff?role=ServiceAdviser&branchId=${branchId ?? ""}`}
                      collection="users"
                      disabled={!branchId}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      error={errors.serviceAdvisorId?.message} />} />{masterPicker("bayId", "Bay", "BAY", true)}
                  <ReadOnlyField label="Est. part amt" currency value={money(totals.spare)} /><ReadOnlyField label="Est. labour amt" currency value={money(totals.labour)} /><ReadOnlyField label="Est. oil amt" currency value={money(totals.oil)} /><div className="space-y-1.5"><p className="text-xs font-medium">Service charge</p><Controller
                      name="serviceCharge"
                      control={control}
                      render={(
                        {
                          field,
                        },
                      ) => <CurrencyInput
                        label="Service charge"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        error={errors.serviceCharge?.message} />} /></div><div className="rounded-lg border border-primary/20 bg-primary/5 p-3 md:col-span-2"><p className="text-xs font-medium text-muted-foreground">Total estimated amount</p><p aria-live="polite" className="mt-1 text-xl font-semibold tabular-nums text-primary">{money(total)}</p></div>
                </div><p className="mt-3 text-xs text-muted-foreground">Assign an engineer or group. Parts, oil and labour totals come from Customer Requests.</p></OpeningCard>
              <OpeningCard
                title="Delivery & closing"
                description="Available after quality check and billing or credit approval on the saved job card."><div className={openingGrid}><ReadOnlyField label="Vehicle ready" value="Not ready" /><ReadOnlyField label="Delivery date" value="Awaiting delivery" /><ReadOnlyField label="Delivery time" value="Awaiting delivery" /><ReadOnlyField label="Delivered by" value="Awaiting delivery" /><ReadOnlyField label="Invoice no." value="Assigned when invoiced" /></div><div className="mt-4"><OpeningField label="Remarks" error={errors.remarks?.message}><textarea className={`${openingInput} h-24 resize-y py-2`} maxLength={500} {...register("remarks")} /><span className="text-right text-xs text-muted-foreground">{watch("remarks")?.length ?? 0}/500</span></OpeningField></div></OpeningCard>
            </div>
            <div
              role="tabpanel"
              id="job-opening-panel-1"
              aria-labelledby="job-opening-tab-1"
              hidden={tab !== "Customer Requests"}><CustomerRequestsTab lastJobId={lastJob?.id} /></div>
            <div
              role="tabpanel"
              id="job-opening-panel-2"
              aria-labelledby="job-opening-tab-2"
              hidden={tab !== "Other Details"}><OtherDetailsTab /></div>
          </div>
          <footer
            className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-background px-4 py-3 md:px-6"><div className="hidden items-center gap-2 md:flex"><Button
                type="button"
                variant="outline"
                size="sm"
                disabled={create.isPending}
                onClick={() => askReset("new")}><Plus className="mr-1.5 h-4 w-4" />New job card</Button><Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isDirty || create.isPending}
                onClick={() => askReset("undo")}><RotateCcw className="mr-1.5 h-4 w-4" />Undo</Button><Button type="button" variant="outline" size="sm" onClick={() => setFind(true)}><Search className="mr-1.5 h-4 w-4" />Find</Button></div><div><ActionMenu
                align="start"
                trigger={<Button type="button" variant="outline" size="sm" aria-label="More job card actions"><MoreHorizontal className="h-4 w-4" /></Button>}><ActionMenuItem className="md:hidden" disabled={create.isPending} onClick={() => askReset("new")}>New job card</ActionMenuItem><ActionMenuItem className="md:hidden" disabled={!isDirty || create.isPending} onClick={() => askReset("undo")}>Undo changes</ActionMenuItem><ActionMenuItem className="md:hidden" onClick={() => setFind(true)}>Find job card</ActionMenuItem><ActionMenuItem disabled>Edit (already editing)</ActionMenuItem><ActionMenuItem disabled>Delete (save first)</ActionMenuItem><ActionMenuItem disabled>Print (save first)</ActionMenuItem><ActionMenuItem disabled>Invoice details (not invoiced)</ActionMenuItem></ActionMenu></div><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={create.isPending} onClick={onClose}><X className="mr-1 h-4 w-4" />Close</Button><Button
                type="submit"
                disabled={!isDirty || create.isPending || loading || customerQuery.isError || vehicleQuery.isError}><Save className="mr-1.5 h-4 w-4" />{create.isPending ? "Saving..." : "Save job card"}</Button></div></footer>
        </div>
        {(confirmation || find) && <div
          ref={overlay}
          className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-background/95 p-4"
          onKeyDown={event => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setConfirmation(null);
              setFind(false);
            }
          }}><div
            role="dialog"
            aria-modal="true"
            aria-label={find ? "Find job card" : "Confirm changes"}
            className="w-full max-w-lg rounded-xl border bg-background p-5 shadow-lg">{find ? <><h3 className="mb-4 font-semibold">Find job card</h3><WorkshopPicker
                label="Job number, registration or customer"
                endpoint="/service/job-cards"
                collection="jobCards"
                onChange={() => {}}
                onSelect={record => window.open(`/job-cards/${record.id}`, "_blank", "noopener,noreferrer")} /><Button type="button" variant="outline" className="mt-4" onClick={() => setFind(false)}>Back to opening</Button></> : <><h3 className="font-semibold">{confirmation === "estimate" ? "Load this estimate?" : "Discard unsaved changes?"}</h3><p className="mt-2 text-sm text-muted-foreground">{confirmation === "estimate" ? "This replaces the selected customer, vehicle and request lines." : "Your unsaved entries will be cleared."}</p><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" autoFocus onClick={() => setConfirmation(null)}>Keep editing</Button><Button
                  type="button"
                  onClick={() => {
                    if (confirmation === "estimate")
                      applyEstimate();
                    else if (confirmation)
                      resetForm(confirmation);

                    setConfirmation(null);
                  }}>Continue</Button></div></>}</div></div>}
      </form></FormProvider>
  );
}
