import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { userKeys } from "../api/user.keys";
import { setUserPermissionsRequest } from "../api/user.api";

/** Saves a user's own grants and denials. */
export function useSetUserPermissions(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { grants: string[]; denies: string[] }) => setUserPermissionsRequest(id, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(userKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success("Access saved");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to save access";
      toast.error(message);
    },
  });
}
