"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateCustomer } from "../hooks/use-create-customer";
import {
  createCustomerSchema,
  type CreateCustomerFormValues,
} from "../schemas/customer.schema";

interface CustomerCreateFormProps {
  onSuccess?: () => void;
}

export function CustomerCreateForm({ onSuccess }: CustomerCreateFormProps) {
  const create = useCreateCustomer();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateCustomerFormValues>({
    resolver: zodResolver(createCustomerSchema),
  });

  function onSubmit(values: CreateCustomerFormValues) {
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
        <CardTitle>Add customer</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" error={errors.firstName?.message}>
              <input
                className={inputCls}
                placeholder="Jane"
                {...register("firstName")}
              />
            </Field>
            <Field label="Last name" error={errors.lastName?.message}>
              <input
                className={inputCls}
                placeholder="Doe"
                {...register("lastName")}
              />
            </Field>
          </div>

          <Field label="Email" error={errors.email?.message}>
            <input
              type="email"
              className={inputCls}
              placeholder="jane@example.com"
              {...register("email")}
            />
          </Field>

          <Field label="Phone" error={errors.phone?.message}>
            <input
              className={inputCls}
              placeholder="+234 800 000 0000"
              {...register("phone")}
            />
          </Field>

          <Field label="Address (optional)" error={errors.address?.message}>
            <input
              className={inputCls}
              placeholder="123 Main St, Lagos"
              {...register("address")}
            />
          </Field>

          <Button type="submit" disabled={create.isPending} className="mt-1">
            {create.isPending ? "Adding…" : "Add customer"}
          </Button>
        </form>
      </CardContent>
    </Card>
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
