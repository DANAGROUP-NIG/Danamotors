"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { resetPasswordRequest } from "../api/auth.api";

export function useResetPassword() {
  return useMutation({
    mutationFn: (payload: { token: string; newPassword: string }) =>
      resetPasswordRequest(payload),
    onSuccess: () => {
      toast.success("Password reset successfully. Sign in with your new password.");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to reset password";
      toast.error(message);
    },
  });
}
