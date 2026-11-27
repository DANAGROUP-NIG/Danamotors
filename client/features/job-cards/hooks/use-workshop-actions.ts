"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost, apiPut } from "@/lib/api/apiClient";
import { jobCardKeys } from "../api/job-card.keys";

/** Saved work done and charges. Only changed values are sent. */
export interface WorkDoneInput {
  serviceCharge?: number;
  engineerId?: string | null;
  workDone: string;
}

/** Assigning the technician; at Diagnosis also the bay, a note and a request ID (a double click assigns once). */
export interface AssignInput {
  technicianId: string;
  bayId?: string;
  note?: string;
  requestId?: string;
}

export interface DeliveryInput {
  deliveryAdvisorId: string;
  lateReasonIds: string[];
  lateRemarks?: string;
  remarks?: string;
}

/**
 * The workshop actions that are not step handoffs: assigning the technician, saving work done,
 * recording the quality check, delivering, and approving delivery on credit. Each refreshes the
 * job and its workspace, because the server may move the step as a result.
 */
export function useWorkshopActions(jobCardId: string, jobNumber: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: jobCardKeys.detail(jobCardId) });

  const assign = useMutation({
    // Offline, fail at once and show the message (choices are kept) rather than wait silently.
    networkMode: "always",
    mutationFn: (input: AssignInput) => apiPost(`/workshop/assign/${jobCardId}`, input),
    // The caller says who it went to; the job and its workspace (under the same key) refresh.
    onSuccess: refresh,
  });

  const saveWorkDone = useMutation({
    mutationFn: (input: WorkDoneInput) => apiPut(`/service/job-cards/${jobCardId}`, input),
    onSuccess: async () => {
      toast.success(`Work done saved on job ${jobNumber}`);
      await refresh();
    },
  });

  const deliver = useMutation({
    mutationFn: (input: DeliveryInput) => apiPut(`/service/job-cards/${jobCardId}`, { status: "DELIVERED", ...input }),
    onSuccess: async () => {
      toast.success(`Job ${jobNumber} delivered and gate pass issued`);
      await refresh();
    },
  });

  const approveCredit = useMutation({
    mutationFn: (remarks: string) => apiPost(`/service/job-cards/${jobCardId}/credit-approval`, { remarks }),
    onSuccess: async () => {
      toast.success(`Delivery on credit approved for job ${jobNumber}`);
      await refresh();
    },
  });

  return { assign, saveWorkDone, deliver, approveCredit };
}
