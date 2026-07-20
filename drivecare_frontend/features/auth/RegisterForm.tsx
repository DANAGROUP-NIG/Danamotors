"use client";

import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api/apiClient";
import { registerSchema, type RegisterFormValues } from "./schemas/auth.schema";
import { useRegister } from "./hooks/use-register";

type BranchOption = { id: string; name: string };

function RegisterFormContent() {
  const register = useRegister();
  const [branches, setBranches] = useState<BranchOption[]>([]);

  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  useEffect(() => {
    apiGet<{ branches: BranchOption[] }>("/branches")
      .then((res: { branches: BranchOption[] }) => setBranches(res.branches))
      .catch((err) => console.error("Failed to load branches:", err));
  }, []);

  function onSubmit(values: RegisterFormValues) {
    register.mutate({
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      password: values.password,
      phoneNumber: values.phoneNumber || undefined,
      branchName: values.branchName || undefined,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <Badge className="mt-2">Get started with Dana Motors</Badge>
      </CardHeader>
      <CardContent>
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
              <span className="text-xs text-red-500">
                {errors.email.message}
              </span>
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
            <span className="text-sm font-semibold">
              Branch{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </span>
            <select
              className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
              {...field("branchName")}
            >
              <option value="">No branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
            {errors.branchName && (
              <span className="text-xs text-red-500">
                {errors.branchName.message}
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
            disabled={register.isPending}
          >
            {register.isPending ? "Creating…" : "Create account"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <a className="text-primary hover:underline" href="/login">
              Sign in
            </a>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function RegisterForm() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="p-6">Loading…</CardContent>
        </Card>
      }
    >
      <RegisterFormContent />
    </Suspense>
  );
}
