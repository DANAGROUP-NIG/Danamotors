"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { userKeys } from "../api/user.keys";
import { deleteUserRequest } from "../api/user.api";
import type { User } from "../types/user.types";

export function useBulkDeleteUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (users: User[]) => {
      if (users.length === 0) return { count: 0 };

      const deleting = toast.loading(`Deleting ${users.length} users…`);
      try {
        await Promise.all(users.map((u) => deleteUserRequest(u.id)));
        toast.dismiss(deleting);
        return { count: users.length };
      } catch (error) {
        toast.dismiss(deleting);
        throw error;
      }
    },
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success(`${count} user${count === 1 ? "" : "s"} deleted`);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to delete some users";
      toast.error(message);
    },
  });
}
