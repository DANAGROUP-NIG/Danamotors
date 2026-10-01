import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { warrantyKeys } from "@/features/warranty/api/warranty.keys";
import { jobCardKeys } from "../api/job-card.keys";
import {
  addLabourLineRequest,
  deleteJobCardLineRequest,
  generateJobCardInvoiceRequest,
  getJobCardLinesRequest,
  issuePartRequest,
  updateJobCardLineRequest,
} from "../api/job-card-lines.api";
import type { LabourLinePayload, UpdateLinePayload } from "../types/job-card-line.types";

export const jobCardLineKeys = {
  lines: (jobCardId: string) => ["job-card-lines", jobCardId] as const,
};

export function useJobCardLines(jobCardId: string) {
  return useQuery({ queryKey: jobCardLineKeys.lines(jobCardId), queryFn: () => getJobCardLinesRequest(jobCardId), enabled: Boolean(jobCardId) });
}

function useLinesMutation<V, R>(jobCardId: string, fn: (vars: V) => Promise<R>, success: string | ((r: R) => string), failure: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: jobCardLineKeys.lines(jobCardId) });
      qc.invalidateQueries({ queryKey: jobCardKeys.detail(jobCardId) });
      qc.invalidateQueries({ queryKey: warrantyKeys.cases() });
      toast.success(typeof success === "function" ? success(result) : success);
    },
    onError: (error) => toast.error(apiErrorMessage(error, failure)),
  });
}

export const useAddLabourLine = (jobCardId: string) =>
  useLinesMutation(jobCardId, (body: LabourLinePayload) => addLabourLineRequest(jobCardId, body), "Labour line added", "Could not add the labour line");

export const useUpdateJobCardLine = (jobCardId: string) =>
  useLinesMutation(
    jobCardId,
    ({ lineId, body }: { lineId: string; body: UpdateLinePayload }) => updateJobCardLineRequest(jobCardId, lineId, body),
    "Line updated",
    "Could not update the line",
  );

export const useDeleteJobCardLine = (jobCardId: string) =>
  useLinesMutation(jobCardId, (lineId: string) => deleteJobCardLineRequest(jobCardId, lineId), "Line removed", "Could not remove the line");

export const useGenerateJobCardInvoice = (jobCardId: string) =>
  useLinesMutation(
    jobCardId,
    (body: { dueDate?: string | null; notes?: string | null }) => generateJobCardInvoiceRequest(jobCardId, body),
    (invoice) => `Invoice ${invoice.invoiceNumber} created`,
    "Could not generate the invoice",
  );

export const useIssuePart = (jobCardId: string) =>
  useLinesMutation(
    jobCardId,
    (body: Parameters<typeof issuePartRequest>[0]) => issuePartRequest(body),
    "Part issued to the job card",
    "Could not issue the part",
  );
