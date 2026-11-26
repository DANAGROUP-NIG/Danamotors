"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPatch, apiPost, apiPut } from "@/lib/api/apiClient";
import { jobCardKeys } from "../api/job-card.keys";

/** Saved findings and charges. Only changed values are sent. */
export interface FindingsInput {
  serviceCharge?: number;
  engineerId?: string | null;
  observations: string;
  workDone: string;
}

export interface DeliveryInput {
  deliveryAdvisorId: string;
  lateReasonIds: string[];
  lateRemarks?: string;
  remarks?: string;
}

/**
 * The workshop actions that are not step handoffs: assigning the technician, saving findings,
 * recording the quality check, delivering, and approving delivery on credit. Each refreshes the
 * job and its workspace, because the server may move the step as a result.
 */
export function useWorkshopActions(jobCardId: string, jobNumber: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: jobCardKeys.detail(jobCardId) });

  const assign = useMutation({
    mutationFn: (technicianId: string) => apiPost(`/workshop/assign/${jobCardId}`, { technicianId }),
    onSuccess: async () => {
      toast.success(`Technician assigned to job ${jobNumber}`);
      await refresh();
    },
  });

  const saveFindings = useMutation({
    mutationFn: (input: FindingsInput) => apiPut(`/service/job-cards/${jobCardId}`, input),
    onSuccess: async () => {
      toast.success(`Findings saved on job ${jobNumber}`);
      await refresh();
    },
  });

  const recordQc = useMutation({
    mutationFn: (input: { qcStatus: "PASSED" | "FAILED"; qcNotes: string }) => apiPatch(`/workshop/qc/${jobCardId}`, input),
    onSuccess: async (_data, input) => {
      toast.success(input.qcStatus === "PASSED" ? `Quality check passed on job ${jobNumber}` : `Quality check failure recorded on job ${jobNumber}`);
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

  return { assign, saveFindings, recordQc, deliver, approveCredit };
}
