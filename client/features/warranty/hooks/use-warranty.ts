import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notificationKeys } from "@/features/notification/api/notification.keys";
import {
  addCaseLineRequest,
  createVehicleModelRequest,
  createWarrantyCodeRequest,
  deleteCaseLineRequest,
  getVehicleModelsRequest,
  getVehicleWarrantyRequest,
  getWarrantyCaseRequest,
  getWarrantyCasesRequest,
  getWarrantyCodesRequest,
  getWarrantySummaryRequest,
  importCaseLinesRequest,
  openWarrantyCaseRequest,
  searchWarrantyPartsRequest,
  transitionWarrantyCaseRequest,
  updateCaseLineRequest,
  updateVehicleModelRequest,
  updateVehicleWarrantyRequest,
  updateWarrantyCaseRequest,
  updateWarrantyCodeRequest,
} from "../api/warranty.api";
import { warrantyKeys } from "../api/warranty.keys";
import { CASE_STATUS_LABELS, apiErrorMessage } from "../lib/warranty-format";
import type {
  CaseLinePayload,
  CaseListParams,
  CodeType,
  TransitionPayload,
  UpdateVehicleWarrantyPayload,
  VehicleModelPayload,
  WarrantyCase,
  WarrantyCode,
} from "../types/warranty.types";

// ── Queries ──────────────────────────────────────────────────────────────────

/** Coverage and open campaigns for a vehicle; pass today's odometer to check the km limit. */
export function useVehicleWarranty(vehicleId?: string | null, mileage?: number, enabled = true) {
  return useQuery({
    queryKey: warrantyKeys.vehicle(vehicleId ?? "", mileage),
    queryFn: () => getVehicleWarrantyRequest(vehicleId!, mileage),
    enabled: Boolean(vehicleId) && enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useVehicleModels(params: { search?: string; includeInactive?: boolean } = {}) {
  return useQuery({ queryKey: warrantyKeys.models(params), queryFn: () => getVehicleModelsRequest(params), staleTime: 5 * 60_000 });
}

export function useWarrantyCodes(includeInactive = false) {
  return useQuery({ queryKey: warrantyKeys.codes(includeInactive), queryFn: () => getWarrantyCodesRequest(includeInactive), staleTime: 5 * 60_000 });
}

export function useWarrantyParts(search: string, applicableOnly = false) {
  return useQuery({
    queryKey: warrantyKeys.parts(search, applicableOnly),
    queryFn: () => searchWarrantyPartsRequest(search, applicableOnly),
    enabled: search.trim().length >= 2,
    placeholderData: keepPreviousData,
  });
}

export function useWarrantySummary() {
  return useQuery({ queryKey: warrantyKeys.summary(), queryFn: getWarrantySummaryRequest });
}

export function useWarrantyCases(params: CaseListParams) {
  return useQuery({
    queryKey: warrantyKeys.caseList(params),
    queryFn: () => getWarrantyCasesRequest(params),
    placeholderData: keepPreviousData,
  });
}

export function useWarrantyCase(id: string) {
  return useQuery({ queryKey: warrantyKeys.case(id), queryFn: () => getWarrantyCaseRequest(id), enabled: Boolean(id) });
}

// ── Case mutations ───────────────────────────────────────────────────────────

function useCaseMutation<V>(fn: (vars: V) => Promise<WarrantyCase>, success: string | ((c: WarrantyCase) => string), failure: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (c) => {
      qc.setQueryData(warrantyKeys.case(c.id), c);
      qc.invalidateQueries({ queryKey: warrantyKeys.cases() });
      qc.invalidateQueries({ queryKey: warrantyKeys.summary() });
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      toast.success(typeof success === "function" ? success(c) : success);
    },
    onError: (error) => toast.error(apiErrorMessage(error, failure)),
  });
}

export const useOpenWarrantyCase = () =>
  useCaseMutation(
    (body: { jobCardId: string; complaint?: string }) => openWarrantyCaseRequest(body),
    (c) => `Warranty case ${c.caseNumber} opened`,
    "Could not open the warranty case",
  );

export const useUpdateWarrantyCase = (id: string) =>
  useCaseMutation(
    (body: Parameters<typeof updateWarrantyCaseRequest>[1]) => updateWarrantyCaseRequest(id, body),
    "Warranty case updated",
    "Could not update the case",
  );

export const useTransitionWarrantyCase = (id: string) =>
  useCaseMutation(
    (body: TransitionPayload) => transitionWarrantyCaseRequest(id, body),
    (c) => `Case is now ${CASE_STATUS_LABELS[c.status].toLowerCase()}`,
    "Could not update the case",
  );

export const useAddCaseLine = (id: string) =>
  useCaseMutation((body: CaseLinePayload) => addCaseLineRequest(id, body), "Claim line added", "Could not add the line");

export const useUpdateCaseLine = (id: string) =>
  useCaseMutation(
    ({ lineId, body }: { lineId: string; body: Partial<CaseLinePayload> }) => updateCaseLineRequest(id, lineId, body),
    "Claim line updated",
    "Could not update the line",
  );

export const useDeleteCaseLine = (id: string) =>
  useCaseMutation((lineId: string) => deleteCaseLineRequest(id, lineId), "Claim line removed", "Could not remove the line");

export function useImportCaseLines(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => importCaseLinesRequest(id),
    onSuccess: (result) => {
      qc.setQueryData(warrantyKeys.case(id), result.case);
      qc.invalidateQueries({ queryKey: warrantyKeys.cases() });
      if (result.imported === 0 && result.skipped.length === 0) toast.info("No new warranty lines on the job card");
      else toast.success(`Imported ${result.imported} line(s)${result.skipped.length ? `; skipped ${result.skipped.length}` : ""}`);
      result.skipped.forEach((s) => toast.warning(s));
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not import lines")),
  });
}

// ── Settings mutations ───────────────────────────────────────────────────────

export function useSaveVehicleModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: VehicleModelPayload }) =>
      id ? updateVehicleModelRequest(id, body) : createVehicleModelRequest(body),
    onSuccess: (_m, vars) => {
      qc.invalidateQueries({ queryKey: [...warrantyKeys.all, "models"] });
      qc.invalidateQueries({ queryKey: warrantyKeys.vehicles() });
      toast.success(vars.id ? "Model policy updated" : "Model added");
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not save the model")),
  });
}

export function useSaveWarrantyCode(type: CodeType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Partial<WarrantyCode> }) =>
      id ? updateWarrantyCodeRequest(type, id, body) : createWarrantyCodeRequest(type, body as { code: string; description: string }),
    onSuccess: (_c, vars) => {
      qc.invalidateQueries({ queryKey: [...warrantyKeys.all, "codes"] });
      toast.success(vars.id ? "Code updated" : "Code added");
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not save the code")),
  });
}

export function useUpdateVehicleWarranty(vehicleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateVehicleWarrantyPayload) => updateVehicleWarrantyRequest(vehicleId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: warrantyKeys.vehicles() });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Vehicle warranty updated");
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not update the vehicle warranty")),
  });
}
