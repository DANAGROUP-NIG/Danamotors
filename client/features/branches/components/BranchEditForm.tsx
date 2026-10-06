"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useUpdateBranch } from "../hooks/use-update-branch";
import { useBranch } from "../hooks/use-branch";
import { BranchPlacementFields } from "./BranchPlacementFields";
import {
  updateBranchSchema,
  type UpdateBranchFormValues,
} from "../schemas/branch.schema";
import type { Branch } from "../types/branch.types";

interface BranchEditFormProps {
  branch: Branch;
  onSuccess?: () => void;
}

export function BranchEditForm({ branch, onSuccess }: BranchEditFormProps) {
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
      code: branch.code ?? "",
      parentBranchId: branch.parentBranchId ?? "",
    },
  });
  const { data: detail } = useBranch(branch.id);
  const hasSubLocations = (detail?.branch.subLocations?.length ?? 0) > 0;

  useEffect(() => {
    reset({
      name: branch.name,
      address: branch.address ?? "",
      city: branch.city ?? "",
      state: branch.state ?? "",
      country: branch.country ?? "",
      phoneNumber: branch.phoneNumber ?? "",
      email: branch.email ?? "",
      code: branch.code ?? "",
      parentBranchId: branch.parentBranchId ?? "",
    });
  }, [branch, reset]);

  function onSubmit(values: UpdateBranchFormValues) {
    const { code, parentBranchId, ...rest } = values;
    const payload = {
      ...(Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== "" && v !== undefined)) as Omit<
        UpdateBranchFormValues,
        "code" | "parentBranchId"
      >),
      // Empty clears these, so they are always sent.
      code: code?.trim() ? code.trim().toUpperCase() : null,
      parentBranchId: parentBranchId || null,
    };
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

      <BranchPlacementFields register={register} errors={errors} selfId={branch.id} hasSubLocations={hasSubLocations} />

      <Button type="submit" disabled={update.isPending} size="sm">
        {update.isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
