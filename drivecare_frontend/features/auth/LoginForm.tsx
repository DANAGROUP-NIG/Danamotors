"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { loginSchema, type LoginFormValues, useLogin } from "@/features/auth";

import { AuthCardHeader } from "./components/AuthCardHeader";
import { AuthFormInput } from "./components/AuthFormInput";
import { AuthSubmitButton } from "./components/AuthSubmitButton";

function LoginFormContent() {
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);
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
      <AuthCardHeader title="Welcome back" badgeText="Sign in to continue" />
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <AuthFormInput
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register("email")}
          />

          <label className="grid gap-2">
            <span className="text-sm font-semibold">Password</span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="h-11 w-full rounded-md border border-border bg-background px-3 pr-10 outline-none focus:ring-2 focus:ring-ring"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.password?.message && (
              <span className="text-xs text-red-500">{errors.password.message}</span>
            )}
          </label>

          <AuthSubmitButton
            isLoading={login.isPending}
            loadingText="Signing in..."
          >
            Sign in
          </AuthSubmitButton>
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
