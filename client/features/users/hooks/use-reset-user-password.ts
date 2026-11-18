"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { resetUserPasswordRequest } from "../api/user.api";

export function useResetUserPassword(id: string) {
  return useMutation({
    mutationFn: (newPassword: string) => resetUserPasswordRequest(id, newPassword),
    onSuccess: () => {
      toast.success("Password reset. The user has been signed out of all sessions.");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to reset password";
      toast.error(message);
    },
  });
}
