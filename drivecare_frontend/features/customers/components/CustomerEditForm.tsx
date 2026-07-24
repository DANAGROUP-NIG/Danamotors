"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useUpdateCustomer } from "../hooks/use-update-customer";
import {
  updateCustomerSchema,
  type UpdateCustomerFormValues,
} from "../schemas/customer.schema";
import type { Customer } from "../types/customer.types";

interface CustomerEditFormProps {
  customer: Customer;
  onSuccess?: () => void;
}

export function CustomerEditForm({
  customer,
  onSuccess,
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
      phoneNumber: customer.phoneNumber ?? "",
      address: customer.address ?? "",
    },
  });

  useEffect(() => {
    reset({
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phoneNumber: customer.phoneNumber ?? "",
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

      <Field label="Phone" error={errors.phoneNumber?.message}>
        <input className={inputCls} {...register("phoneNumber")} />
      </Field>

      <Field label="Address (optional)" error={errors.address?.message}>
        <input className={inputCls} {...register("address")} />
      </Field>

      <Button type="submit" disabled={update.isPending} size="sm">
        {update.isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
