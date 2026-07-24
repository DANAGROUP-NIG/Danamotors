import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createJobCardRequest } from "../api/job-card.api";
import { jobCardKeys } from "../api/job-card.keys";

export function useCreateJobCard() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: createJobCardRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jobCardKeys.lists() });
    },
  });
}
