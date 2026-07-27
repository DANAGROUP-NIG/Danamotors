"use client";

import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent } from "@/components/ui/card";
import { loginSchema, type LoginFormValues, useLogin } from "@/features/auth";

import { AuthCardHeader } from "./components/AuthCardHeader";
import { AuthFormInput } from "./components/AuthFormInput";
import { AuthSubmitButton } from "./components/AuthSubmitButton";

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
      <AuthCardHeader title="Welcome back" badgeText="Sign in to continue" />
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <AuthFormInput
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register("email")}
          />

          <AuthFormInput
            label="Password"
            type="password"
            error={errors.password?.message}
            {...register("password")}
          />

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
