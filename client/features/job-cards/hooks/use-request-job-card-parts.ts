import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { requestJobCardParts } from "../api/job-card.api";
import { jobCardKeys } from "../api/job-card.keys";

export function useRequestJobCardParts(jobCardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => requestJobCardParts(jobCardId, requestId),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: jobCardKeys.detail(jobCardId) });
      toast.success("Branch Store Manager notified of the parts request");
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not send the parts request")),
  });
}
