"use client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "../api/csc.api";
import { cscKeys } from "../api/csc.api";
import { apiErrorMessage } from "../lib/csc.logic";
import type { CaseListParams, FollowUpPayload, GeneratePayload, ReasonPayload, SaveRulesPayload } from "../types/csc.types";

const LONG = 5 * 60_000;

export const useRuleModels = () => useQuery({ queryKey: cscKeys.models(), queryFn: api.getRuleModels, staleTime: LONG });
export const useModelRules = (modelId: string) => useQuery({ queryKey: cscKeys.rules(modelId), queryFn: () => api.getModelRules(modelId), enabled: !!modelId });
export const useServiceTypes = () => useQuery({ queryKey: cscKeys.serviceTypes(), queryFn: api.getServiceTypes, staleTime: LONG });
export const useReasons = (includeInactive = false) => useQuery({ queryKey: cscKeys.reasons(includeInactive), queryFn: () => api.getReasons(includeInactive), staleTime: LONG });
export const useCases = (params: CaseListParams) => useQuery({ queryKey: cscKeys.list(params), queryFn: () => api.getCases(params), placeholderData: keepPreviousData });
export const useCase = (id: string | null) => useQuery({ queryKey: cscKeys.detail(id ?? ""), queryFn: () => api.getCase(id!), enabled: !!id });
export const useCscSummary = () => useQuery({ queryKey: cscKeys.summary(), queryFn: api.getSummary });
export const useCscStaff = () => useQuery({ queryKey: cscKeys.staff(), queryFn: api.getStaff, staleTime: LONG });

export function useSaveRules() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveRulesPayload) => api.saveRules(payload),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: cscKeys.models() });
      void client.invalidateQueries({ queryKey: [...cscKeys.all, "rules"] });
      toast.success(result.models > 1 ? `Schedule saved for ${result.models} models` : "Schedule saved");
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not save the schedule")),
  });
}

export function useSaveReason(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReasonPayload) => (id ? api.updateReason(id, payload) : api.createReason(payload)),
    onSuccess: (reason) => {
      void client.invalidateQueries({ queryKey: [...cscKeys.all, "reasons"] });
      toast.success(id ? `Reason ${reason.code} updated` : `Reason ${reason.code} added`);
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not save the reason")),
  });
}

export function useDeleteReason() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteReason(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...cscKeys.all, "reasons"] });
      toast.success("Reason deleted");
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not delete the reason")),
  });
}

export function useGenerateCases() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: GeneratePayload) => api.generateCases(payload),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: cscKeys.cases() });
      void client.invalidateQueries({ queryKey: cscKeys.summary() });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not generate the cases")),
  });
}

export function useSaveFollowUp(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: FollowUpPayload) => api.saveFollowUp(id, payload),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: cscKeys.cases() });
      void client.invalidateQueries({ queryKey: cscKeys.summary() });
      const parts = ["Follow-up saved"];
      if (result.booking) parts.push(result.booking.linked ? `linked to booking ${result.booking.bookingNumber ?? ""}`.trim() : `booking ${result.booking.bookingNumber ?? ""} created`.trim());
      if (result.closure) parts.push(result.closure.closureType === "FINAL" ? `case closed (${result.closure.code})` : `stage closed (${result.closure.code})`);
      toast.success(parts.join(" · "));
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not save the follow-up")),
  });
}
