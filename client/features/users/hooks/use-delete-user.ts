import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { userKeys } from "../api/user.keys";
import { deleteUserRequest } from "../api/user.api";

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteUserRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success("User deleted");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to delete user";
      toast.error(message);
    },
  });
}
