"use client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage } from "@/features/late-deliveries/lib/late-delivery.logic";
import * as api from "../api/psf.api";
import { psfKeys, type PsfListParams } from "../api/psf.api";
import type { PsfCallPayload } from "../types/psf.types";

export const usePsfJobs = (params: PsfListParams) => useQuery({ queryKey: psfKeys.list(params), queryFn: () => api.getPsfJobs(params), placeholderData: keepPreviousData });

export const usePsfDetail = (id: string | null) =>
  useQuery({ queryKey: psfKeys.detail(id ?? ""), queryFn: () => api.getPsfDetail(id!), enabled: !!id, retry: false });

export const usePsfServiceTypes = () => useQuery({ queryKey: psfKeys.serviceTypes(), queryFn: api.getPsfServiceTypes, staleTime: 10 * 60_000 });

/** Job number or registration → the job to open (errors explain why a job cannot be followed up). */
export const useFindPsfJob = () => useMutation({ mutationFn: (q: string) => api.findPsfJob(q) });

export function useRecordPsfCall(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: PsfCallPayload) => api.recordPsfCall(id, payload),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: psfKeys.all });
      toast.success(result.booking ? `Call saved: ${result.statusLabel}. Booking ${result.booking.bookingNumber ?? ""} ${result.booking.linked ? "linked" : "created"}.` : `Call saved: ${result.statusLabel}`);
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not save the call")),
  });
}
