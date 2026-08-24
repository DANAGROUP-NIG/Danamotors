"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { setStoredUser } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth.store";
import { updateProfileRequest } from "@/features/auth/api/auth.api";
import type { UpdateProfilePayload } from "@/features/auth/types/auth.types";

export function useUpdateProfile() {
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => updateProfileRequest(payload),
    onSuccess: (user) => {
      setUser(user);
      setStoredUser(user);
      toast.success("Profile updated");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to update profile";
      toast.error(message);
    },
  });
}
