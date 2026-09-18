"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { userKeys } from "../api/user.keys";
import { updateUserRequest } from "../api/user.api";
import type { User, UpdateUserPayload } from "../types/user.types";

export function useBulkUpdateUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      users,
      payload,
      label,
    }: {
      users: User[];
      payload: UpdateUserPayload;
      label: string;
    }) => {
      if (users.length === 0) return { count: 0 };

      const updating = toast.loading(`Updating ${users.length} users…`);
      try {
        await Promise.all(users.map((u) => updateUserRequest(u.id, payload)));
        toast.dismiss(updating);
        return { count: users.length, label };
      } catch (error) {
        toast.dismiss(updating);
        throw error;
      }
    },
    onSuccess: ({ count, label }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success(`${count} user${count === 1 ? "" : "s"} ${label}`);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to update some users";
      toast.error(message);
    },
  });
}
