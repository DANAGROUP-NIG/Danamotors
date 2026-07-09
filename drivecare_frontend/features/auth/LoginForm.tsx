"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    setLoading(true);
    try {
      // Placeholder: wire to your auth API
      console.log("Login", values);
      // simulate success
      await new Promise((r) => setTimeout(r, 600));
      router.push("/");
    } finally {
      setLoading(false);
    }
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
            {errors.email && <span className="text-xs text-red-500">{errors.email.message}</span>}
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold">Password</span>
            <input
              type="password"
              className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
              {...register("password")}
            />
            {errors.password && <span className="text-xs text-red-500">{errors.password.message}</span>}
          </label>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" />
              <span className="font-medium">Remember me</span>
            </label>
            <a className="text-sm text-primary hover:underline" href="/forgot-password">Forgot password?</a>
          </div>

          <Button type="submit" size="lg" className="mt-2" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don’t have an account? <a className="text-primary hover:underline" href="/register">Register</a>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
