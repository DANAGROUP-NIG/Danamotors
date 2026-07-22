"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { useUpdateBranch } from "../hooks/use-update-branch";
import {
  updateBranchSchema,
  type UpdateBranchFormValues,
} from "../schemas/branch.schema";
import type { Branch } from "../types/branch.types";

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

interface BranchEditFormProps {
  branch: Branch;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function BranchEditForm({
  branch,
  onSuccess,
  onCancel,
}: BranchEditFormProps) {
  const update = useUpdateBranch(branch.id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateBranchFormValues>({
    resolver: zodResolver(updateBranchSchema),
    defaultValues: {
      name: branch.name,
      address: branch.address ?? "",
      city: branch.city ?? "",
      state: branch.state ?? "",
      country: branch.country ?? "",
      phoneNumber: branch.phoneNumber ?? "",
      email: branch.email ?? "",
    },
  });

  useEffect(() => {
    reset({
      name: branch.name,
      address: branch.address ?? "",
      city: branch.city ?? "",
      state: branch.state ?? "",
      country: branch.country ?? "",
      phoneNumber: branch.phoneNumber ?? "",
      email: branch.email ?? "",
    });
  }, [branch, reset]);

  function onSubmit(values: UpdateBranchFormValues) {
    const payload = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== "" && v !== undefined),
    ) as UpdateBranchFormValues;
    update.mutate(payload, { onSuccess });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <Field label="Branch name" error={errors.name?.message}>
        <input className={inputCls} {...register("name")} />
      </Field>

      <Field label="Address" error={errors.address?.message}>
        <input className={inputCls} {...register("address")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City" error={errors.city?.message}>
          <input className={inputCls} {...register("city")} />
        </Field>
        <Field label="State" error={errors.state?.message}>
          <input className={inputCls} {...register("state")} />
        </Field>
        <Field label="Country" error={errors.country?.message}>
          <input className={inputCls} {...register("country")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" error={errors.phoneNumber?.message}>
          <input className={inputCls} {...register("phoneNumber")} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <input type="email" className={inputCls} {...register("email")} />
        </Field>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={update.isPending} size="sm">
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={update.isPending}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
