"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateBranch } from "../hooks/use-create-branch";
import {
  createBranchSchema,
  type CreateBranchFormValues,
} from "../schemas/branch.schema";

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

interface BranchCreateFormProps {
  onSuccess?: () => void;
}

export function BranchCreateForm({ onSuccess }: BranchCreateFormProps) {
  const create = useCreateBranch();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateBranchFormValues>({
    resolver: zodResolver(createBranchSchema),
  });

  function onSubmit(values: CreateBranchFormValues) {
    create.mutate(values, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add branch</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <Field label="Branch name" error={errors.name?.message}>
            <input
              className={inputCls}
              placeholder="e.g. Ikeja Branch"
              {...register("name")}
            />
          </Field>

          <Field label="Address" error={errors.address?.message}>
            <input
              className={inputCls}
              placeholder="123 Main Street"
              {...register("address")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City" error={errors.city?.message}>
              <input className={inputCls} placeholder="Lagos" {...register("city")} />
            </Field>
            <Field label="State" error={errors.state?.message}>
              <input className={inputCls} placeholder="Lagos" {...register("state")} />
            </Field>
            <Field label="Country" error={errors.country?.message}>
              <input className={inputCls} placeholder="Nigeria" {...register("country")} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" error={errors.phoneNumber?.message}>
              <input
                className={inputCls}
                placeholder="+234 800 000 0000"
                {...register("phoneNumber")}
              />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <input
                type="email"
                className={inputCls}
                placeholder="branch@example.com"
                {...register("email")}
              />
            </Field>
          </div>

          <Button type="submit" disabled={create.isPending} className="mt-1">
            {create.isPending ? "Adding…" : "Add branch"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
