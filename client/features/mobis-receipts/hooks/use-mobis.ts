import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryKeys } from "@/features/inventory/api/inventory.keys";
import { notificationKeys } from "@/features/notification/api/notification.keys";
import {
  cancelMitRequest,
  createMrnRequest,
  getMobisMitRequest,
  getMobisMitsRequest,
  importMitRequest,
  mobisKeys,
} from "../api/mobis.api";
import type { CreateMrnPayload, ImportMitPayload, MitStatus, MobisMit } from "../types/mobis.types";

export function mobisErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { message?: string; errors?: { field?: string; message: string }[] } } })
    ?.response?.data;
  const first = data?.errors?.[0];
  return first ? `${first.field ? `${first.field}: ` : ""}${first.message}` : (data?.message ?? fallback);
}

export function useMobisMits(params: { status?: MitStatus; search?: string } = {}) {
  return useQuery({
    queryKey: mobisKeys.list(params),
    queryFn: () => getMobisMitsRequest(params),
    placeholderData: keepPreviousData,
  });
}

export function useMobisMit(id: string) {
  return useQuery({ queryKey: mobisKeys.detail(id), queryFn: () => getMobisMitRequest(id), enabled: !!id });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return (mit: MobisMit) => {
    queryClient.setQueryData(mobisKeys.detail(mit.id), mit);
    queryClient.invalidateQueries({ queryKey: mobisKeys.all });
    queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  };
}

export function useImportMit() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (payload: ImportMitPayload) => importMitRequest(payload),
    onSuccess: (mit) => {
      refresh(mit);
      toast.success(`MIT ${mit.mitNumber} created from invoice ${mit.invoiceNumber}`);
    },
    onError: (error) => toast.error(mobisErrorMessage(error, "Failed to import the invoice")),
  });
}

export function useCreateMrn(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (payload: CreateMrnPayload) => createMrnRequest(id, payload),
    onSuccess: (mit) => {
      refresh(mit);
      toast.success(`MRN ${mit.mrn?.mrnNumber} posted. Stock added to ${mit.destinationBranch.name}`);
    },
    onError: (error) => toast.error(mobisErrorMessage(error, "Failed to generate the MRN")),
  });
}

export function useCancelMit(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (reason?: string) => cancelMitRequest(id, reason),
    onSuccess: (mit) => {
      refresh(mit);
      toast.success(`MIT ${mit.mitNumber} cancelled`);
    },
    onError: (error) => toast.error(mobisErrorMessage(error, "Failed to cancel the MIT")),
  });
}
