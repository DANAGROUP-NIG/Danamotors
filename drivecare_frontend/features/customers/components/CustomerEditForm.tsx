"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { useUpdateCustomer } from "../hooks/use-update-customer";
import {
  updateCustomerSchema,
  type UpdateCustomerFormValues,
} from "../schemas/customer.schema";
import type { Customer } from "../types/customer.types";

interface CustomerEditFormProps {
  customer: Customer;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function CustomerEditForm({
  customer,
  onSuccess,
  onCancel,
}: CustomerEditFormProps) {
  const update = useUpdateCustomer(customer.id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateCustomerFormValues>({
    resolver: zodResolver(updateCustomerSchema),
    defaultValues: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phoneNumber ?? "",
      address: customer.address ?? "",
    },
  });

  // Re-populate if the customer prop changes (e.g. selecting a different row)
  useEffect(() => {
    reset({
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phoneNumber ?? "",
      address: customer.address ?? "",
    });
  }, [customer, reset]);

  function onSubmit(values: UpdateCustomerFormValues) {
    update.mutate(values, { onSuccess });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName?.message}>
          <input className={inputCls} {...register("firstName")} />
        </Field>
        <Field label="Last name" error={errors.lastName?.message}>
          <input className={inputCls} {...register("lastName")} />
        </Field>
      </div>

      <Field label="Email" error={errors.email?.message}>
        <input type="email" className={inputCls} {...register("email")} />
      </Field>

      <Field label="Phone" error={errors.phone?.message}>
        <input className={inputCls} {...register("phone")} />
      </Field>

      <Field label="Address (optional)" error={errors.address?.message}>
        <input className={inputCls} {...register("address")} />
      </Field>

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

// ─── shared helpers ────────────────────────────────────────────────────────────

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
