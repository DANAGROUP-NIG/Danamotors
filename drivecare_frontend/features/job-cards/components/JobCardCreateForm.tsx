"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCreateJobCard } from "../hooks/use-create-job-card";
import {
  createJobCardSchema,
  type CreateJobCardFormValues,
} from "../schemas/job-card.schema";

interface JobCardCreateFormProps {
  onSuccess?: () => void;
}

export function JobCardCreateForm({ onSuccess }: JobCardCreateFormProps) {
  const create = useCreateJobCard();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { isSuperAdmin } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateJobCardFormValues>({
    resolver: zodResolver(createJobCardSchema),
    defaultValues: {
      branchName: isSuperAdmin ? "" : (activeBranch?.name ?? ""),
    },
  });

  function onSubmit(values: CreateJobCardFormValues) {
    create.mutate(values, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job number" error={errors.jobNumber?.message}>
          <input
            className={inputCls}
            placeholder="JC-001"
            {...register("jobNumber")}
          />
        </Field>
        <Field label="Branch" error={errors.branchName?.message}>
          <input
            className={inputCls}
            placeholder="e.g. Ikeja Branch"
            readOnly={!isSuperAdmin}
            {...register("branchName")}
          />
        </Field>
      </div>

      <Field label="Description" error={errors.description?.message}>
        <textarea
          className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Brief description of the job..."
          {...register("description")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Customer ID (optional)" error={errors.customerId?.message}>
          <input
            className={inputCls}
            placeholder="UUID"
            {...register("customerId")}
          />
        </Field>
        <Field label="Vehicle ID (optional)" error={errors.vehicleId?.message}>
          <input
            className={inputCls}
            placeholder="UUID"
            {...register("vehicleId")}
          />
        </Field>
        <Field label="Appointment ID (optional)" error={errors.appointmentId?.message}>
          <input
            className={inputCls}
            placeholder="UUID"
            {...register("appointmentId")}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Estimated hours (optional)" error={errors.estimatedHours?.message}>
          <input
            type="number"
            className={inputCls}
            placeholder="e.g. 4"
            {...register("estimatedHours")}
          />
        </Field>
        <Field label="Estimated cost (optional)" error={errors.estimatedCost?.message}>
          <input
            type="number"
            className={inputCls}
            placeholder="e.g. 50000"
            {...register("estimatedCost")}
          />
        </Field>
      </div>

      <Button type="submit" disabled={create.isPending} className="mt-1">
        {create.isPending ? "Creating..." : "Create job card"}
      </Button>
    </form>
  );
}
