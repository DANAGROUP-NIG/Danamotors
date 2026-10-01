import { apiGet, apiPatch, apiPost, apiPut, apiDelete } from "@/lib/api/apiClient";
import type {
  CaseLinePayload,
  CaseListParams,
  CodeType,
  TransitionPayload,
  UpdateVehicleWarrantyPayload,
  VehicleModel,
  VehicleModelPayload,
  WarrantyCase,
  WarrantyCaseList,
  WarrantyCheck,
  WarrantyCode,
  WarrantyCodes,
  WarrantyPart,
  WarrantySummary,
} from "../types/warranty.types";

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const s = query.toString();
  return s ? `?${s}` : "";
}

// ── Coverage ─────────────────────────────────────────────────────────────────

export const getVehicleWarrantyRequest = (vehicleId: string, mileage?: number) =>
  apiGet<WarrantyCheck>(`/vehicles/${vehicleId}/warranty${qs({ mileage })}`);

export const updateVehicleWarrantyRequest = (vehicleId: string, body: UpdateVehicleWarrantyPayload) =>
  apiPut<WarrantyCheck>(`/vehicles/${vehicleId}/warranty`, body);

// ── Models ───────────────────────────────────────────────────────────────────

export async function getVehicleModelsRequest(params: { search?: string; includeInactive?: boolean } = {}) {
  const data = await apiGet<{ models: VehicleModel[] }>(`/vehicle-models${qs(params)}`);
  return data.models;
}

export async function createVehicleModelRequest(body: VehicleModelPayload) {
  return (await apiPost<{ model: VehicleModel }>("/vehicle-models", body)).model;
}

export async function updateVehicleModelRequest(id: string, body: Partial<VehicleModelPayload>) {
  return (await apiPut<{ model: VehicleModel }>(`/vehicle-models/${id}`, body)).model;
}

// ── Codes & parts ────────────────────────────────────────────────────────────

export const getWarrantyCodesRequest = (includeInactive = false) =>
  apiGet<WarrantyCodes>(`/warranty/codes${qs({ includeInactive: includeInactive || undefined })}`);

export async function createWarrantyCodeRequest(type: CodeType, body: { code: string; description: string }) {
  return (await apiPost<{ code: WarrantyCode }>(`/warranty/codes/${type}`, body)).code;
}

export async function updateWarrantyCodeRequest(type: CodeType, id: string, body: Partial<WarrantyCode>) {
  return (await apiPut<{ code: WarrantyCode }>(`/warranty/codes/${type}/${id}`, body)).code;
}

export async function searchWarrantyPartsRequest(search: string, applicableOnly = false) {
  return (await apiGet<{ parts: WarrantyPart[] }>(`/warranty/parts${qs({ search, applicableOnly: applicableOnly || undefined })}`)).parts;
}

// ── Cases ────────────────────────────────────────────────────────────────────

export const getWarrantySummaryRequest = () => apiGet<WarrantySummary>("/warranty/summary");

export const getWarrantyCasesRequest = (params: CaseListParams) => apiGet<WarrantyCaseList>(`/warranty/cases${qs(params)}`);

export async function getWarrantyCaseRequest(id: string) {
  return (await apiGet<{ case: WarrantyCase }>(`/warranty/cases/${id}`)).case;
}

export async function openWarrantyCaseRequest(body: { jobCardId: string; complaint?: string }) {
  return (await apiPost<{ case: WarrantyCase }>("/warranty/cases", body)).case;
}

export async function updateWarrantyCaseRequest(
  id: string,
  body: Partial<Pick<WarrantyCase, "complaintCodeId" | "complaint" | "manufacturerClaimNo" | "manufacturerClaimDate">>,
) {
  return (await apiPatch<{ case: WarrantyCase }>(`/warranty/cases/${id}`, body)).case;
}

export async function transitionWarrantyCaseRequest(id: string, body: TransitionPayload) {
  return (await apiPatch<{ case: WarrantyCase }>(`/warranty/cases/${id}/status`, body)).case;
}

export async function addCaseLineRequest(id: string, body: CaseLinePayload) {
  return (await apiPost<{ case: WarrantyCase }>(`/warranty/cases/${id}/lines`, body)).case;
}

export async function updateCaseLineRequest(id: string, lineId: string, body: Partial<CaseLinePayload>) {
  return (await apiPatch<{ case: WarrantyCase }>(`/warranty/cases/${id}/lines/${lineId}`, body)).case;
}

export async function deleteCaseLineRequest(id: string, lineId: string) {
  return (await apiDelete<{ case: WarrantyCase }>(`/warranty/cases/${id}/lines/${lineId}`)).case;
}

export const importCaseLinesRequest = (id: string) =>
  apiPost<{ imported: number; skipped: string[]; case: WarrantyCase }>(`/warranty/cases/${id}/lines/import-from-job-card`);
