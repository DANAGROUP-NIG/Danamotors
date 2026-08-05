"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setSession } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth.store";
import { registerRequest } from "../api/auth.api";
import type { RegisterPayload } from "../types/auth.types";

export function useRegister() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (payload: RegisterPayload) => registerRequest(payload),
    onSuccess: (data) => {
      setSession(data.accessToken, data.refreshToken, data.user);
      setUser(data.user);
      toast.success("Account created — welcome!");
      router.push("/dashboard");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Registration failed";
      toast.error(message);
    },
  });
}
