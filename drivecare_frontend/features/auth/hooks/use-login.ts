"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { setSession } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth.store";
import { loginRequest } from "../api/auth.api";
import type { LoginPayload } from "../types/auth.types";

export function useLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (payload: LoginPayload) => loginRequest(payload),
    onSuccess: (data) => {
      setSession(data.accessToken, data.refreshToken, data.user);
      setUser(data.user);
      toast.success("Login successful");

      const redirect = searchParams.get("redirect");
      router.push(redirect && redirect.startsWith("/") ? redirect : "/dashboard");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Login failed";
      toast.error(message);
    },
  });
}
