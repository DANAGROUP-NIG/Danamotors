"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  customerRegisterSchema,
  type CustomerRegisterFormValues,
} from "./schemas/auth.schema";
import { useCustomerRegister } from "./hooks/use-customer-register";

export function CustomerRegisterForm() {
  const customerRegister = useCustomerRegister();

  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerRegisterFormValues>({
    resolver: zodResolver(customerRegisterSchema),
  });

  function onSubmit(values: CustomerRegisterFormValues) {
    customerRegister.mutate({
      email: values.email,
      password: values.password,
      firstName: values.firstName || undefined,
      lastName: values.lastName || undefined,
      phoneNumber: values.phoneNumber || undefined,
    });
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Register to view your vehicles, service history and invoices. Your email
        must match the one Dana Motors has on file for you.
      </p>
      <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-2">
            <span className="text-sm font-semibold">First name</span>
            <input
              type="text"
              className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
              {...field("firstName")}
            />
            {errors.firstName && (
              <span className="text-xs text-red-500">
                {errors.firstName.message}
              </span>
            )}
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold">Last name</span>
            <input
              type="text"
              className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
              {...field("lastName")}
            />
            {errors.lastName && (
              <span className="text-xs text-red-500">
                {errors.lastName.message}
              </span>
            )}
          </label>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-semibold">Email</span>
          <input
            type="email"
            className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
            {...field("email")}
          />
          {errors.email && (
            <span className="text-xs text-red-500">{errors.email.message}</span>
          )}
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-semibold">
            Phone number{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </span>
          <input
            type="tel"
            className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
            {...field("phoneNumber")}
          />
          {errors.phoneNumber && (
            <span className="text-xs text-red-500">
              {errors.phoneNumber.message}
            </span>
          )}
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-semibold">Password</span>
          <input
            type="password"
            className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
            {...field("password")}
          />
          {errors.password && (
            <span className="text-xs text-red-500">
              {errors.password.message}
            </span>
          )}
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-semibold">Confirm password</span>
          <input
            type="password"
            className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
            {...field("confirmPassword")}
          />
          {errors.confirmPassword && (
            <span className="text-xs text-red-500">
              {errors.confirmPassword.message}
            </span>
          )}
        </label>

        <Button
          type="submit"
          size="lg"
          className="mt-2"
          disabled={customerRegister.isPending}
        >
          {customerRegister.isPending ? "Creating…" : "Create portal account"}
        </Button>
      </form>
    </>
  );
}
