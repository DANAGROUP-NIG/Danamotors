"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clearSession, getRefreshToken } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth.store";
import { logoutRequest } from "../api/auth.api";

export function useLogout() {
  const router = useRouter();
  const reset = useAuthStore((s) => s.reset);

  return useMutation({
    mutationFn: async () => {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        await logoutRequest(refreshToken);
      }
    },
    onSettled: () => {
      clearSession();
      reset();
      toast.success("Logged out");
      router.push("/login");
    },
  });
}
