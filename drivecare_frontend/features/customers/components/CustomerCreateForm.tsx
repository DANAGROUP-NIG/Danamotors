"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranchStore } from "@/store/branch.store";
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
  const { isSuperAdmin } = useAuth();
  const branches = useBranchStore((s) => s.branches);
  const activeBranch = useBranchStore((s) => s.activeBranch);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateCustomerFormValues>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      branchId: isSuperAdmin ? "" : (activeBranch?.id ?? ""),
    },
  });

  function onSubmit(values: CreateCustomerFormValues) {
    const payload = {
      ...values,
      branchId: isSuperAdmin ? values.branchId : (activeBranch?.id ?? values.branchId),
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

      <Field label="Phone" error={errors.phoneNumber?.message}>
        <input
          className={inputCls}
          placeholder="+234 800 000 0000"
          {...register("phoneNumber")}
        />
      </Field>

      <Field label="Address (optional)" error={errors.address?.message}>
        <input
          className={inputCls}
          placeholder="123 Main St, Lagos"
          {...register("address")}
        />
      </Field>

      {isSuperAdmin ? (
        <Field label="Branch" error={errors.branchId?.message}>
          <select className={inputCls} {...register("branchId")}>
            <option value="">Select branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      ) : activeBranch ? (
        <Field label="Branch">
          <input type="hidden" {...register("branchId")} />
          <input
            className={inputCls}
            value={activeBranch.name}
            readOnly
          />
        </Field>
      ) : null}

      <Button type="submit" disabled={create.isPending} className="mt-1">
        {create.isPending ? "Adding…" : "Add customer"}
      </Button>
    </form>
  );
}
