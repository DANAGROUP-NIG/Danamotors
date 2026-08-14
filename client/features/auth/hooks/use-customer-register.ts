"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setSession } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth.store";
import { customerRegisterRequest } from "../api/auth.api";
import type { CustomerRegisterPayload } from "../types/auth.types";

export function useCustomerRegister() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (payload: CustomerRegisterPayload) =>
      customerRegisterRequest(payload),
    onSuccess: (data) => {
      setSession(data.accessToken, data.refreshToken, data.user);
      setUser(data.user);
      toast.success("Portal account created — welcome!");
      router.push("/portal");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Registration failed";
      toast.error(message);
    },
  });
}
