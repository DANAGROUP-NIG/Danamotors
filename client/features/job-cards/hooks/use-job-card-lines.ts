import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { warrantyKeys } from "@/features/warranty/api/warranty.keys";
import { jobCardKeys } from "../api/job-card.keys";
import { getJobCardLinesRequest, updateJobCardLineRequest } from "../api/job-card-lines.api";
import type { UpdateLinePayload } from "../types/job-card-line.types";

export const jobCardLineKeys = {
  // Under the job card's detail key, so labour, part and billing changes that refresh the
  // job card also refresh who pays for each line.
  lines: (jobCardId: string) => [...jobCardKeys.detail(jobCardId), "lines"] as const,
};

export function useJobCardLines(jobCardId: string) {
  return useQuery({ queryKey: jobCardLineKeys.lines(jobCardId), queryFn: () => getJobCardLinesRequest(jobCardId), enabled: Boolean(jobCardId) });
}

export function useUpdateJobCardLine(jobCardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, body }: { lineId: string; body: UpdateLinePayload }) => updateJobCardLineRequest(jobCardId, lineId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jobCardKeys.detail(jobCardId) });
      qc.invalidateQueries({ queryKey: warrantyKeys.cases() });
      toast.success("Line updated");
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not update the line")),
  });
}
