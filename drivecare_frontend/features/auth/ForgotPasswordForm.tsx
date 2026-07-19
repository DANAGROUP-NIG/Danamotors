"use client";

import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useForgotPassword } from "./hooks/use-forgot-password";

const forgotSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

type ForgotValues = z.infer<typeof forgotSchema>;

function ForgotPasswordFormContent() {
  const forgotPassword = useForgotPassword();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) });

  function onSubmit(values: ForgotValues) {
    forgotPassword.mutate(values.email);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <Badge className="mt-2">We&apos;ll email a reset link</Badge>
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
              <span className="text-xs text-red-500">{errors.email.message}</span>
            )}
          </label>

          <Button
            type="submit"
            size="lg"
            className="mt-2"
            disabled={forgotPassword.isPending}
          >
            {forgotPassword.isPending ? "Sending…" : "Send reset link"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Remembered your password?{" "}
            <a className="text-primary hover:underline" href="/login">
              Sign in
            </a>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ForgotPasswordForm() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="p-6">Loading…</CardContent>
        </Card>
      }
    >
      <ForgotPasswordFormContent />
    </Suspense>
  );
}
