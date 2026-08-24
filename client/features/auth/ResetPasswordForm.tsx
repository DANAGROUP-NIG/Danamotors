"use client";

import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useResetPassword } from "./hooks/use-reset-password";

const resetSchema = z
  .object({
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type ResetValues = z.infer<typeof resetSchema>;

function ResetPasswordFormContent() {
  const token = useSearchParams().get("token") ?? "";
  const resetPassword = useResetPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
  });

  function onSubmit(values: ResetValues) {
    resetPassword.mutate({ token, newPassword: values.newPassword });
  }

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid reset link</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This password reset link is missing its token. Request a new reset
            link below.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <Field label="New password" error={errors.newPassword?.message}>
            <input
              type="password"
              className={inputCls}
              autoComplete="new-password"
              {...register("newPassword")}
            />
          </Field>
          <Field label="Confirm password" error={errors.confirmPassword?.message}>
            <input
              type="password"
              className={inputCls}
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
          </Field>

          <Button
            type="submit"
            size="lg"
            className="mt-2"
            disabled={resetPassword.isPending}
          >
            {resetPassword.isPending ? "Resetting…" : "Reset password"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            <a className="text-primary hover:underline" href="/login">
              Back to sign in
            </a>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordForm() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="p-6">Loading…</CardContent>
        </Card>
      }
    >
      <ResetPasswordFormContent />
    </Suspense>
  );
}
