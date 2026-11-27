"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api/apiClient";
import { jobCardKeys } from "../api/job-card.keys";
import { billingStepKey } from "./use-job-billing";
import type { DeliveryPayload, JobDeliveryStep, PhoneSignaturePayload, ReleaseApprovalPayload } from "../types/job-delivery.types";

export const deliveryStepKey = (id: string) => [...jobCardKeys.detail(id), "delivery"] as const;
const base = (id: string) => `/service/job-cards/${id}/delivery`;
const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status;

/** The Delivery step: work done, declined items, belongings, collector, phone approvals and, once delivered, the summary. */
export function useJobDelivery(id: string, enabled = true) {
  return useQuery({
    queryKey: deliveryStepKey(id),
    queryFn: () => apiGet<JobDeliveryStep>(base(id)),
    enabled: enabled && !!id,
    retry: (count, error) => statusOf(error) !== 403 && count < 2,
  });
}

/** After anything on Delivery: the step, the job (gate pass, header) and its workspace (stepper, bar). */
function useRefresh(id: string) {
  const client = useQueryClient();
  return async (step: JobDeliveryStep) => {
    client.setQueryData(deliveryStepKey(id), step);
    void client.invalidateQueries({ queryKey: billingStepKey(id) });
    await Promise.all([
      client.invalidateQueries({ queryKey: jobCardKeys.workspace(id) }),
      client.invalidateQueries({ queryKey: jobCardKeys.detail(id), exact: true }),
    ]);
  };
}

/** Complete delivery: the customer's signature, then the gate pass, and the job closes. */
export function useDeliver(id: string, jobNumber: string) {
  const refresh = useRefresh(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (body: DeliveryPayload) => apiPost<JobDeliveryStep, DeliveryPayload>(base(id), body),
    onSuccess: async (step) => {
      const gatePass = step.delivered?.gatePassNumber;
      toast.success(gatePass ? `Job ${jobNumber} delivered. Gate pass ${gatePass} issued.` : `Job ${jobNumber} delivered.`);
      await refresh(step);
    },
  });
}

/** The customer signs, at delivery, the estimate they approved on the phone. */
export function useSignPhoneApprovals(id: string) {
  const refresh = useRefresh(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (body: PhoneSignaturePayload) => apiPost<JobDeliveryStep, PhoneSignaturePayload>(`${base(id)}/estimate-signature`, body),
    onSuccess: async (step) => {
      toast.success("The customer signed the estimate they approved on the phone.");
      await refresh(step);
    },
  });
}

/** A service or workshop manager approves releasing the vehicle to someone else. */
export function useApproveRelease(id: string) {
  const refresh = useRefresh(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (body: ReleaseApprovalPayload) => apiPost<JobDeliveryStep, ReleaseApprovalPayload>(`${base(id)}/release-approval`, body),
    onSuccess: async (step) => {
      toast.success(`Release to ${step.releaseApproval?.collectorName ?? "the collector"} approved.`);
      await refresh(step);
    },
  });
}

/** The advisor asks the branch managers, in the app, to approve the release. */
export function useRequestRelease(id: string) {
  const refresh = useRefresh(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (body: { requestId: string; collectorName: string }) =>
      apiPost<{ notified: string[]; delivery: JobDeliveryStep }, { requestId: string; collectorName: string }>(`${base(id)}/release-request`, body),
    onSuccess: async (result) => {
      toast.success(`Asked ${new Intl.ListFormat("en-GB", { type: "conjunction" }).format(result.notified)} to approve the release.`);
      await refresh(result.delivery);
    },
  });
}
