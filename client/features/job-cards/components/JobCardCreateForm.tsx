"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Car, FileText, Gauge, Loader2, Phone, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { useBranchStore } from "@/store/branch.store";
import { useFetchBranches } from "@/features/branches/hooks/useFetchBranches";
import { VehicleSelectWithCreate } from "@/features/vehicles/components/VehicleSelectWithCreate";
import { useVehicle } from "@/features/vehicles/hooks/use-vehicle";
import type { Vehicle } from "@/features/vehicles/types/vehicle.types";
import { useAppointment } from "@/features/appointments/hooks/use-appointment";
import { useAppointments } from "@/features/appointments/hooks/use-appointments";
import { useVehicleWarranty } from "@/features/warranty/hooks/use-warranty";
import { WarrantyCheckPanel, ackRequiredCheck } from "@/features/warranty/components/WarrantyCheckPanel";
import { fmtDate, fmtDateTime, fmtKm, apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import type { WarrantyCheck } from "@/features/warranty/types/warranty.types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { useCreateJobCard } from "../hooks/use-create-job-card";
import { createJobCardSchema, type CreateJobCardFormInput, type CreateJobCardFormValues } from "../schemas/job-card.schema";

const textareaCls =
  "min-h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 text-base font-semibold text-slate-800">
      <span className="text-slate-600 [&_svg]:size-5">{icon}</span>
      {children}
    </h2>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
      <span className="text-slate-500 [&_svg]:size-4">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
  );
}

/**
 * Screen 02 — open a job card for a customer vehicle. The warranty & campaign check runs
 * as soon as the vehicle and mileage are known, before the job card can be created.
 */
export function JobCardCreateForm({ appointmentId: initialAppointmentId, vehicleId: initialVehicleId }: { appointmentId?: string; vehicleId?: string }) {
  const router = useRouter();
  const create = useCreateJobCard();
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const canSeeWarranty = isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.READ);
  const branches = useBranchStore((s) => s.branches);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  useFetchBranches(true);

  const appointmentQuery = useAppointment(initialAppointmentId ?? "");
  const appointment = appointmentQuery.data?.appointment;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitted },
  } = useForm<CreateJobCardFormInput, unknown, CreateJobCardFormValues>({
    resolver: zodResolver(createJobCardSchema),
    defaultValues: {
      vehicleId: initialVehicleId ?? "",
      appointmentId: initialAppointmentId ?? "",
      mileage: "",
      odometerReplaced: false,
      odometerReplacedReason: "",
      jobNumber: "",
      branchName: activeBranch?.name ?? "",
      description: "",
    },
  });

  const vehicleId = watch("vehicleId");
  const selectedAppointmentId = watch("appointmentId");
  const odometerReplaced = watch("odometerReplaced");
  const rawMileage = String(watch("mileage") ?? "").replace(/,/g, "");
  const mileageNumber = /^\d+$/.test(rawMileage) ? Number(rawMileage) : undefined;
  const debouncedMileage = useDebouncedValue(mileageNumber, 450);

  // Prefill from the appointment the job card is opened for.
  useEffect(() => {
    if (!appointment) return;
    setValue("vehicleId", appointment.vehicleId);
    if (appointment.branch?.name) setValue("branchName", appointment.branch.name);
    if (appointment.notes) setValue("description", appointment.notes);
  }, [appointment, setValue]);

  useEffect(() => {
    if (!watch("branchName") && activeBranch?.name) setValue("branchName", activeBranch.name);
  }, [activeBranch, setValue, watch]);

  const vehicleQuery = useVehicle(vehicleId ?? "");
  const [pickedVehicle, setPickedVehicle] = useState<Vehicle | null>(null);
  const vehicle = (vehicleQuery.data?.vehicle as Vehicle | undefined) ?? pickedVehicle;
  const customer = vehicle?.customer;

  const appointmentsQuery = useAppointments(customer?.id ? { customerId: customer.id, limit: 50 } : undefined);
  const openAppointments = useMemo(
    () =>
      (appointmentsQuery.data?.appointments ?? []).filter(
        (a) => a.vehicleId === vehicleId && !["Completed", "Cancelled", "Closed"].includes(a.status),
      ),
    [appointmentsQuery.data, vehicleId],
  );

  const warranty = useVehicleWarranty(vehicleId, debouncedMileage, canSeeWarranty && debouncedMileage !== undefined);
  const [serverCheck, setServerCheck] = useState<WarrantyCheck | null>(null);
  const check = serverCheck ?? warranty.data;
  const [acknowledged, setAcknowledged] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  // A new check (vehicle or mileage changed) needs a fresh acknowledgement.
  useEffect(() => {
    setAcknowledged(false);
    setServerCheck(null);
  }, [vehicleId, debouncedMileage]);
  useEffect(() => {
    if (warranty.dataUpdatedAt) setCheckedAt(new Date(warranty.dataUpdatedAt));
  }, [warranty.dataUpdatedAt]);

  const needsAck = Boolean(check?.requiresAcknowledgement) && !acknowledged;
  const lastRecorded = check?.vehicle.lastRecordedMileage ?? vehicle?.lastRecordedMileage ?? null;

  function onSubmit(values: CreateJobCardFormValues) {
    if (canSeeWarranty && needsAck) {
      toast.error("Acknowledge the warranty and campaign check first");
      return;
    }
    create.mutate(
      {
        vehicleId: values.vehicleId,
        customerId: customer?.id,
        appointmentId: values.appointmentId || undefined,
        branchName: values.branchName,
        jobNumber: values.jobNumber.trim(),
        description: values.description.trim(),
        estimatedHours: values.estimatedHours,
        estimatedCost: values.estimatedCost,
        mileage: values.mileage,
        odometerReplaced: values.odometerReplaced || undefined,
        odometerReplacedReason: values.odometerReplaced ? values.odometerReplacedReason?.trim() : undefined,
        warrantyAcknowledged: acknowledged && check?.coverage.status === "ACTIVE",
        acknowledgedCampaignIds: acknowledged ? (check?.openCampaigns ?? []).map((c) => c.campaignId) : [],
      },
      {
        onSuccess: (card) => {
          toast.success(`Job card ${card.jobNumber} created`);
          if (card.warrantyCase) toast.success(`Warranty case ${card.warrantyCase.caseNumber} opened`);
          router.push(`/job-cards/${card.id}`);
        },
        onError: (error) => {
          const latest = ackRequiredCheck(error);
          if (latest) {
            // The coverage or campaigns changed since the check ran: show the server's view and ask again.
            setServerCheck(latest);
            setAcknowledged(false);
            toast.error("The warranty check changed. Review it and acknowledge again.");
            return;
          }
          toast.error(apiErrorMessage(error, "Could not create the job card"));
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* ── Left: form ── */}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        <section className="p-6">
          <SectionTitle icon={<Car />}>Vehicle & Customer</SectionTitle>
          <Field label="Vehicle" error={errors.vehicleId?.message}>
            <Controller
              control={control}
              name="vehicleId"
              render={({ field }) => (
                <VehicleSelectWithCreate
                  value={field.value}
                  onChange={(id) => {
                    field.onChange(id);
                    setValue("appointmentId", "");
                  }}
                  onVehicleSelect={setPickedVehicle}
                  disabled={Boolean(initialAppointmentId)}
                  error={errors.vehicleId?.message}
                />
              )}
            />
          </Field>
          {customer && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Chip icon={<User />}>
                {customer.firstName} {customer.lastName}
              </Chip>
              <Chip icon={<Phone />}>{customer.phoneNumber || customer.email}</Chip>
              <Chip icon={<Building2 />}>{watch("branchName") || "—"}</Chip>
            </div>
          )}
          <div className="mt-4">
            <Field label="Linked appointment">
              <select className={inputCls} {...register("appointmentId")} disabled={!vehicleId || Boolean(initialAppointmentId)}>
                <option value="">No appointment (walk-in)</option>
                {appointment && !openAppointments.some((a) => a.id === appointment.id) && (
                  <option value={appointment.id}>
                    APT · {fmtDateTime(appointment.scheduledAt)} · {appointment.status}
                  </option>
                )}
                {openAppointments.map((a) => (
                  <option key={a.id} value={a.id}>
                    APT · {fmtDateTime(a.scheduledAt)} · {a.status}
                  </option>
                ))}
              </select>
            </Field>
            {selectedAppointmentId && appointment?.status === "Pending" && (
              <p className="mt-1 text-xs text-amber-700">This appointment is not checked in yet.</p>
            )}
          </div>
        </section>

        <section className="p-6">
          <SectionTitle icon={<Gauge />}>Odometer</SectionTitle>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field label="Current mileage (km)" error={errors.mileage?.message}>
              <input className={cn(inputCls, "h-12 text-base")} inputMode="numeric" placeholder="e.g. 61580" autoComplete="off" {...register("mileage")} />
              <span className="text-xs text-slate-500">
                {lastRecorded != null
                  ? `Last recorded: ${fmtKm(lastRecorded)}${check?.vehicle.lastMileageAt ? ` on ${fmtDate(check.vehicle.lastMileageAt)}` : ""}`
                  : vehicleId
                    ? "No previous reading recorded"
                    : "Select a vehicle first"}
              </span>
            </Field>
            <label className="flex items-center gap-3 pt-2 text-sm text-slate-700 sm:pt-8">
              <input type="checkbox" className="size-4 accent-[#05141F]" {...register("odometerReplaced")} />
              Odometer was replaced
            </label>
          </div>
          {odometerReplaced && (
            <div className="mt-4">
              <Field label="Reason for the odometer replacement" error={errors.odometerReplacedReason?.message}>
                <input className={inputCls} placeholder="e.g. Instrument cluster replaced under job JC-2026-000112" {...register("odometerReplacedReason")} />
              </Field>
              <p className="mt-1 text-xs text-slate-500">A lower reading is only accepted with a reason, which is kept on the job card.</p>
            </div>
          )}
        </section>

        <section className="p-6">
          <SectionTitle icon={<FileText />}>Job details</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job number" error={errors.jobNumber?.message}>
              <input className={cn(inputCls, "font-mono")} placeholder="JC-2026-000418" {...register("jobNumber")} />
            </Field>
            <Field label="Branch" error={errors.branchName?.message}>
              {isSuperAdmin ? (
                <select className={inputCls} {...register("branchName")}>
                  <option value="">Select branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input className={inputCls} readOnly {...register("branchName")} />
              )}
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Customer complaint / description" error={errors.description?.message}>
              <textarea className={textareaCls} placeholder="e.g. Engine warning light on, rough idle when cold" {...register("description")} />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Estimated hours" error={errors.estimatedHours?.message}>
              <input className={inputCls} inputMode="decimal" placeholder="e.g. 3.5" {...register("estimatedHours")} />
            </Field>
            <Field label="Estimated cost (₦)" error={errors.estimatedCost?.message}>
              <input className={inputCls} inputMode="decimal" placeholder="e.g. 145000" {...register("estimatedCost")} />
            </Field>
          </div>
        </section>
      </div>

      {/* ── Right: warranty & campaign check ── */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
              <ShieldCheck className="size-5 text-slate-600" /> Warranty & Campaign Check
            </h2>
            {warranty.isFetching ? (
              <Loader2 className="size-4 animate-spin text-slate-400" />
            ) : (
              checkedAt && check && <span className="text-xs text-slate-400">Checked {fmtDateTime(checkedAt.toISOString()).split(" ")[1]}</span>
            )}
          </div>
          <p className="mb-4 text-sm text-slate-500">These checks run before the job card is created.</p>
          {canSeeWarranty ? (
            <WarrantyCheckPanel
              check={debouncedMileage !== undefined && vehicleId ? check : undefined}
              isFetching={warranty.isFetching}
              isError={warranty.isError}
              acknowledged={acknowledged}
              onAcknowledgedChange={setAcknowledged}
              acknowledgedBy={user ? `${user.firstName} ${user.lastName}` : undefined}
            />
          ) : (
            <p className="text-sm text-slate-400">You do not have access to warranty information.</p>
          )}
        </div>
      </aside>

      {/* ── Actions ── */}
      <div className="flex flex-wrap items-center justify-end gap-3 lg:col-span-2">
        {isSubmitted && Object.keys(errors).length > 0 && <p className="mr-auto text-sm text-red-600">Fix the highlighted fields.</p>}
        <Button type="button" variant="outline" size="lg" asChild>
          <Link href={initialAppointmentId ? `/appointments/${initialAppointmentId}` : "/job-cards"}>Cancel</Link>
        </Button>
        <Button type="submit" size="lg" disabled={create.isPending || (canSeeWarranty && needsAck)}>
          {create.isPending ? "Creating…" : "Create Job Card"}
        </Button>
      </div>
    </form>
  );
}
