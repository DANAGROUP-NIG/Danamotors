"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCreateAppointment } from "../hooks/use-create-appointment";
import { useAllCustomers } from "../hooks/use-all-customers";
import { useAllVehicles } from "../hooks/use-all-vehicles";
import {
  createAppointmentSchema,
  type CreateAppointmentFormValues,
} from "../schemas/appointment.schema";

interface AppointmentCreateFormProps {
  onSuccess?: () => void;
}

export function AppointmentCreateForm({ onSuccess }: AppointmentCreateFormProps) {
  const create = useCreateAppointment();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const branches = useBranchStore((s) => s.branches);
  const { isSuperAdmin } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateAppointmentFormValues>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: {
      branchName: isSuperAdmin ? "" : (activeBranch?.name ?? ""),
    },
  });

  const selectedCustomerId = watch("customerId");

  const { data: customers, isLoading: loadingCustomers } = useAllCustomers(
    isSuperAdmin ? undefined : activeBranch?.id,
  );

  const { data: vehicles, isLoading: loadingVehicles } = useAllVehicles({
    customerId: selectedCustomerId || undefined,
    branchId: isSuperAdmin ? undefined : activeBranch?.id,
  });

  function onSubmit(values: CreateAppointmentFormValues) {
    const payload = {
      ...values,
      scheduledAt: new Date(values.scheduledAt).toISOString(),
    };
    create.mutate(payload, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer" error={errors.customerId?.message}>
          <select
            className={inputCls}
            {...register("customerId", {
              onChange: () => setValue("vehicleId", ""),
            })}
          >
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
        <Field label="Vehicle" error={errors.vehicleId?.message}>
          <select
            className={inputCls}
            disabled={!selectedCustomerId}
            {...register("vehicleId")}
          >
            <option value="">
              {!selectedCustomerId
                ? "Select a customer first"
                : loadingVehicles
                  ? "Loading vehicles…"
                  : "Select vehicle"}
            </option>
            {vehicles?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.year ? `${v.year} ` : ""}
                {v.make ?? ""} {v.model ?? ""}
                {v.vin ? ` (${v.vin})` : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
            <input
              className={inputCls}
              readOnly
              value={activeBranch?.name ?? ""}
            />
          )}
        </Field>
        <Field label="Scheduled date & time" error={errors.scheduledAt?.message}>
          <input type="datetime-local" className={inputCls} {...register("scheduledAt")} />
        </Field>
      </div>
      <Field label="Duration (minutes, optional)" error={errors.durationMins?.message}>
        <input
          type="number"
          className={inputCls}
          placeholder="e.g. 60"
          {...register("durationMins")}
        />
      </Field>
      <Field label="Notes (optional)" error={errors.notes?.message}>
        <textarea
          className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Any relevant details for the technician…"
          {...register("notes")}
        />
      </Field>
      <Button type="submit" disabled={create.isPending} className="mt-1">
        {create.isPending ? "Booking…" : "Book appointment"}
      </Button>
    </form>
  );
}
