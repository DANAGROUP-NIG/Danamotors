"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { forgotPasswordRequest } from "../api/auth.api";

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => forgotPasswordRequest(email),
    onSuccess: () => {
      toast.success("Reset link sent — check your inbox");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to send reset link";
      toast.error(message);
    },
  });
}
