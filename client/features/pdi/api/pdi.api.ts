import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api/apiClient";
import type {
  LabourSlipPayload, LabourLinePayload, Paged, PdiBill, PdiBillListItem, PdiBillPayload, PdiBillPreview, PdiDefectOption, PdiJob,
  PdiLabourSlip, PdiListResult, PdiOpenPayload, PdiPrintKind, PdiRequisition, PdiReturn, PdiSettings, PdiSettingsPayload,
  PdiUpdatePayload, PdiVehicle, PdiVehiclePayload, RequisitionPayload, ReturnPayload, ServiceTypeOption, VehiclePdiJob,
} from "../types/pdi.types";

const BASE = "/pdi";

export type PdiListParams = { status?: string; search?: string; vin?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number; branchId?: string };
export type PdiRegisterParams = { search?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number; jobCardId?: string; branchId?: string };

export const pdiKeys = {
  all: ["pdi"] as const,
  list: (params: PdiListParams) => [...pdiKeys.all, "list", params] as const,
  detail: (id: string) => [...pdiKeys.all, "detail", id] as const,
  register: (kind: string, params: PdiRegisterParams) => [...pdiKeys.all, "register", kind, params] as const,
  billPreview: (jobCardId: string, parts: number, labour: number) => [...pdiKeys.all, "bill-preview", jobCardId, parts, labour] as const,
  bill: (id: string) => [...pdiKeys.all, "bill", id] as const,
  settings: () => [...pdiKeys.all, "settings"] as const,
  vehicles: (vin: string) => [...pdiKeys.all, "vehicles", vin] as const,
  vehicleJobs: (vehicleId: string) => [...pdiKeys.all, "vehicle-jobs", vehicleId] as const,
  defects: (vehicleId?: string) => [...pdiKeys.all, "defects", vehicleId ?? ""] as const,
  serviceTypes: (vehicleId: string) => [...pdiKeys.all, "service-types", vehicleId] as const,
};

/** Query string from defined, non-empty values. */
export function query(params: Record<string, string | number | undefined>) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");
  return entries.length ? `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}` : "";
}

export const getPdiList = (params: PdiListParams) => apiGet<PdiListResult>(`${BASE}${query(params)}`);
export const getPdi = (id: string) => apiGet<PdiJob>(`${BASE}/${id}`);
export const openPdi = (payload: PdiOpenPayload) => apiPost<PdiJob>(BASE, payload);
export const updatePdi = (id: string, payload: PdiUpdatePayload) => apiPatch<PdiJob>(`${BASE}/${id}`, payload);
export const markWorkDone = (id: string, workDone?: string) => apiPost<PdiJob>(`${BASE}/${id}/work-done`, { workDone });
export const markVehicleReady = (id: string, remarks?: string) => apiPost<PdiJob>(`${BASE}/${id}/vehicle-ready`, { remarks });
export const cancelPdi = (id: string, reason: string) => apiPost<PdiJob>(`${BASE}/${id}/cancel`, { reason });

export const findPdiVehicles = async (vin: string) => (await apiGet<{ items: PdiVehicle[] }>(`${BASE}/vehicles${query({ vin })}`)).items;
export const createPdiVehicle = (payload: PdiVehiclePayload) => apiPost<PdiVehicle>(`${BASE}/vehicles`, payload);
export const getVehiclePdiJobs = async (vehicleId: string) => (await apiGet<{ items: VehiclePdiJob[] }>(`${BASE}/vehicles/${vehicleId}/jobs`)).items;
export const getPdiDefects = async (vehicleId?: string) => (await apiGet<{ items: PdiDefectOption[] }>(`${BASE}/defects${query({ vehicleId, limit: 50 })}`)).items;
export const getPdiServiceTypes = async (vehicleId: string) => apiGet<{ items: ServiceTypeOption[]; message: string | null }>(`${BASE}/service-types${query({ vehicleId })}`);

export const createPdiRequisition = (payload: RequisitionPayload) => apiPost<PdiRequisition>(`${BASE}/requisitions`, payload);
export const cancelPdiRequisition = (id: string, reason: string) => apiPost<PdiRequisition>(`${BASE}/requisitions/${id}/cancel`, { reason });
export const createPdiReturn = (payload: ReturnPayload) => apiPost<PdiReturn>(`${BASE}/returns`, payload);
export const cancelPdiReturn = (id: string, reason: string) => apiPost<PdiReturn>(`${BASE}/returns/${id}/cancel`, { reason });
export const createPdiLabourSlip = (payload: LabourSlipPayload) => apiPost<PdiLabourSlip>(`${BASE}/labour-slips`, payload);
export const addPdiLabourLine = (slipId: string, payload: LabourLinePayload) => apiPost<PdiLabourSlip>(`${BASE}/labour-slips/${slipId}/lines`, payload);

export const previewPdiBill = (jobCardId: string, partsDiscountPercent: number, labourDiscountPercent: number) =>
  apiPost<PdiBillPreview>(`${BASE}/bills/preview`, { jobCardId, partsDiscountPercent, labourDiscountPercent });
export const createPdiBill = (payload: PdiBillPayload) => apiPost<PdiBill>(`${BASE}/bills`, payload);
export const getPdiBill = (id: string) => apiGet<PdiBill>(`${BASE}/bills/${id}`);
export const cancelPdiBill = (id: string, reason: string) => apiPost<PdiBill>(`${BASE}/bills/${id}/cancel`, { reason });
export const markPdiPrinted = (kind: PdiPrintKind, id: string) => apiPost<{ printedAt: string }>(`${BASE}/print/${kind}/${id}`);

export const getPdiRequisitions = (params: PdiRegisterParams) => apiGet<Paged<PdiRequisition>>(`${BASE}/requisitions${query(params)}`);
export const getPdiReturns = (params: PdiRegisterParams) => apiGet<Paged<PdiReturn>>(`${BASE}/returns${query(params)}`);
export const getPdiLabourSlips = (params: PdiRegisterParams) => apiGet<Paged<PdiLabourSlip>>(`${BASE}/labour-slips${query(params)}`);
export const getPdiBills = (params: PdiRegisterParams) => apiGet<Paged<PdiBillListItem>>(`${BASE}/bills${query(params)}`);

export const getPdiSettings = () => apiGet<PdiSettings>(`${BASE}/settings`);
export const savePdiSettings = (payload: PdiSettingsPayload) => apiPut<PdiSettings>(`${BASE}/settings`, payload);
