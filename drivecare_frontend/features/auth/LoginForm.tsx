"use client";

import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { loginSchema, type LoginFormValues, useLogin } from "@/features/auth";

function LoginFormContent() {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  function onSubmit(values: LoginFormValues) {
    login.mutate(values);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <Badge className="mt-2">Sign in to continue</Badge>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <label className="grid gap-2">
            <span className="text-sm font-semibold">Email</span>
            <input
              type="email"
              className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
              {...register("email")}
            />
            {errors.email && (
              <span className="text-xs text-red-500">
                {errors.email.message}
              </span>
            )}
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold">Password</span>
            <input
              type="password"
              className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
              {...register("password")}
            />
            {errors.password && (
              <span className="text-xs text-red-500">
                {errors.password.message}
              </span>
            )}
          </label>

          {/* <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" />
              <span className="font-medium">Remember me</span>
            </label>
            <a
              className="text-sm text-primary hover:underline"
              href="/forgot-password"
            >
              Forgot password?
            </a>
          </div> */}

          <Button
            type="submit"
            size="lg"
            className="mt-2"
            disabled={login.isPending}
          >
            {login.isPending ? "Signing in..." : "Sign in"}
          </Button>

          {/* <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a className="text-primary hover:underline" href="/register">
              Register
            </a>
          </p> */}
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginForm() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="p-6">Loading...</CardContent>
        </Card>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
