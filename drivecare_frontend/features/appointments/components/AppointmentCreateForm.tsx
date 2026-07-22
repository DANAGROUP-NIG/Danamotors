"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCreateAppointment } from "../hooks/use-create-appointment";
import {
  createAppointmentSchema,
  type CreateAppointmentFormValues,
} from "../schemas/appointment.schema";

const inputCls =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  );
}

interface AppointmentCreateFormProps {
  onSuccess?: () => void;
}

export function AppointmentCreateForm({ onSuccess }: AppointmentCreateFormProps) {
  const create = useCreateAppointment();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { isSuperAdmin } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateAppointmentFormValues>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: {
      branchName: isSuperAdmin ? "" : (activeBranch?.name ?? ""),
    },
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
    <Card>
      <CardHeader>
        <CardTitle>Book appointment</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer ID" error={errors.customerId?.message}>
              <input
                className={inputCls}
                placeholder="Customer UUID"
                {...register("customerId")}
              />
            </Field>
            <Field label="Vehicle ID" error={errors.vehicleId?.message}>
              <input
                className={inputCls}
                placeholder="Vehicle UUID"
                {...register("vehicleId")}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Branch" error={errors.branchName?.message}>
              <input
                className={inputCls}
                placeholder="e.g. Ikeja Branch"
                readOnly={!isSuperAdmin}
                {...register("branchName")}
              />
            </Field>
            <Field label="Scheduled date" error={errors.scheduledAt?.message}>
              <input
                type="datetime-local"
                className={inputCls}
                {...register("scheduledAt")}
              />
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
      </CardContent>
    </Card>
  );
}
