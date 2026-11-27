"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { createJobBillRequest, previewJobBillRequest, type CreateJobBillPayload } from "@/features/invoices/api/invoice.api";
import { invoiceKeys } from "@/features/invoices/api/invoice.keys";
import { jobCardKeys } from "../api/job-card.keys";
import type { JobBillingStep, ReadyNoticePayload } from "../types/job-billing.types";

export const billingStepKey = (id: string) => [...jobCardKeys.detail(id), "billing"] as const;
const base = (id: string) => `/service/job-cards/${id}/billing`;
const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status;

/** The Billing step: notices and storage, washed, estimated and actual, the invoice, credit and the delivery gate. */
export function useJobBilling(id: string, enabled = true) {
  return useQuery({
    queryKey: billingStepKey(id),
    queryFn: () => apiGet<JobBillingStep>(base(id)),
    enabled: enabled && !!id,
    retry: (count, error) => statusOf(error) !== 403 && count < 2,
  });
}

/** After anything on Billing: the step, the job, its workspace (bar, header) and the invoice lists. */
function useRefresh(id: string) {
  const client = useQueryClient();
  return async (step?: JobBillingStep) => {
    if (step) client.setQueryData(billingStepKey(id), step);
    else void client.invalidateQueries({ queryKey: billingStepKey(id) });
    void client.invalidateQueries({ queryKey: invoiceKeys.all });
    await Promise.all([
      client.invalidateQueries({ queryKey: jobCardKeys.workspace(id) }),
      client.invalidateQueries({ queryKey: jobCardKeys.detail(id), exact: true }),
    ]);
  };
}

/** Mark ready and notify: the QC to Ready move and the first notice, in one request. */
export function useMarkReady(id: string, jobNumber: string) {
  const refresh = useRefresh(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (body: ReadyNoticePayload) => apiPost<JobBillingStep, ReadyNoticePayload>(`${base(id)}/ready`, body),
    onSuccess: async (step) => {
      toast.success(`Job ${jobNumber} marked ready. The customer notice is recorded.`);
      await refresh(step);
    },
  });
}

/** Send again: another notice. The storage counter keeps the first. */
export function useNotifyAgain(id: string) {
  const refresh = useRefresh(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (body: ReadyNoticePayload) => apiPost<JobBillingStep, ReadyNoticePayload>(`${base(id)}/notices`, body),
    onSuccess: async (step) => {
      toast.success("Customer notice recorded.");
      await refresh(step);
    },
  });
}

export function useSetWashed(id: string) {
  const refresh = useRefresh(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (washed: boolean) => apiPut<JobBillingStep, { washed: boolean }>(`${base(id)}/washed`, { washed }),
    onSuccess: async (step) => {
      toast.success(step.washed ? "Vehicle washed recorded." : "Vehicle washed cleared.");
      await refresh(step);
    },
  });
}

/** The invoice the Create invoice dialog will make (no discount), with any storage charge proposed. */
export function useInvoicePreview(jobCardId: string, consolidateVehicle: boolean, enabled: boolean) {
  return useQuery({
    queryKey: [...invoiceKeys.jobBillPreview(jobCardId, 0, 0), consolidateVehicle],
    queryFn: () => previewJobBillRequest({ jobCardId, partsDiscountPercent: 0, labourDiscountPercent: 0, consolidateVehicle }),
    enabled: enabled && !!jobCardId,
    retry: false,
  });
}

/** Create invoice from the job: the existing job bill, idempotent by request ID. Stays on the job. */
export function useCreateJobInvoice(id: string) {
  const refresh = useRefresh(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (payload: CreateJobBillPayload) => createJobBillRequest(payload),
    onSuccess: async (invoice) => {
      toast.success(`Invoice ${invoice.invoiceNumber} created.`);
      await refresh();
    },
  });
}

/** Delivery on credit, with the reason kept in the audit trail. */
export function useApproveCredit(id: string, jobNumber: string) {
  const refresh = useRefresh(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (remarks: string) => apiPost(`/service/job-cards/${id}/credit-approval`, { remarks }),
    onSuccess: async () => {
      toast.success(`Delivery on credit approved for job ${jobNumber}.`);
      await refresh();
    },
  });
}
