import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cancelLabelJobRequest,
  getLabelJobsRequest,
  getLabelPrintersRequest,
  labelKeys,
  printLabelsRequest,
  retryLabelJobRequest,
} from "../api/labels.api";
import type { LabelPrinter, LabelPrintJob } from "../types/labels.types";

function errorMessage(error: unknown, fallback: string) {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/** The printer to print on: an online station whose label printer is attached (ready first). */
export function bestPrinter(printers?: LabelPrinter[]) {
  const attached = (printers ?? []).filter((p) => p.online && p.printerModel);
  return attached.find((p) => p.printerStatus === "READY") ?? attached[0] ?? null;
}

export function useLabelPrinters(branchId?: string, enabled = true) {
  return useQuery({
    queryKey: labelKeys.printers(branchId),
    queryFn: () => getLabelPrintersRequest(branchId),
    enabled,
    refetchInterval: enabled ? 15_000 : false,
  });
}

/** Follows a job until a station has printed it (or failed). */
export function useLabelJobs(branchId?: string, enabled = true) {
  return useQuery({
    queryKey: labelKeys.jobs(branchId),
    queryFn: () => getLabelJobsRequest(branchId),
    enabled,
    refetchInterval: (query) => ((query.state.data as LabelPrintJob[] | undefined)?.some((j) => j.status === "QUEUED") ? 3_000 : false),
  });
}

export function usePrintLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: printLabelsRequest,
    onSuccess: ({ job, printers }) => {
      const printer = bestPrinter(printers);
      if (!printer) toast.warning(`${job.labelCount} label(s) queued. No label printer is online at this branch; they print when one is.`);
      else if (printer.printerStatus !== "READY") toast.warning(`${job.labelCount} label(s) queued. The printer on ${printer.name} is not ready: check it.`);
      else toast.success(`${job.labelCount} label(s) sent to the printer on ${printer.name}`);
      qc.invalidateQueries({ queryKey: labelKeys.all });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not send the labels")),
  });
}

export function useRetryLabelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: retryLabelJobRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: labelKeys.all }),
    onError: (e) => toast.error(errorMessage(e, "Could not print the job again")),
  });
}

export function useCancelLabelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelLabelJobRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: labelKeys.all }),
    onError: (e) => toast.error(errorMessage(e, "Could not cancel the job")),
  });
}
