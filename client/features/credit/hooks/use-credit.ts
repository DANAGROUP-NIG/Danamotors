import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  adjustCustomerCreditRequest,
  createCreditApplicationRequest,
  getCreditApplicationsRequest,
  getCustomerCreditRequest,
} from "../api/credit.api";
import { creditKeys } from "../api/credit.keys";
import type {
  AdjustCreditPayload,
  CreateCreditApplicationPayload,
} from "../types/credit.types";

export function useCustomerCredit(customerId: string) {
  return useQuery({
    queryKey: creditKeys.customer(customerId),
    queryFn: () => getCustomerCreditRequest(customerId),
    enabled: !!customerId,
  });
}

export function useAdjustCustomerCredit(customerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AdjustCreditPayload) =>
      adjustCustomerCreditRequest(customerId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: creditKeys.customer(customerId) });
      toast.success("Customer credit updated");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to update customer credit";
      toast.error(message);
    },
  });
}

export function useCreditApplications(params?: {
  status?: string;
  branchId?: string;
}) {
  return useQuery({
    queryKey: creditKeys.applications(params ?? {}),
    queryFn: () => getCreditApplicationsRequest(params),
  });
}

export function useCreateCreditApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCreditApplicationPayload) =>
      createCreditApplicationRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: creditKeys.applications() });
      toast.success(
        "Credit application created. The customer will review it on the portal.",
      );
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to create credit application";
      toast.error(message);
    },
  });
}
