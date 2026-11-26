import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api/apiClient";
import { api } from "@/lib/api/axios";
import { qs } from "@/features/warranty/api/warranty.api";
import type {
  AddVehiclesPayload,
  AddVehiclesResult,
  AddVinRangesResult,
  Campaign,
  CampaignList,
  CampaignPayload,
  CampaignStatus,
  CampaignSummary,
  CampaignType,
  CampaignVehicleDetail,
  CampaignVehicleList,
  CampaignDocument,
  CampaignVehicleStatus,
  ContactChannel,
  ContactOutcome,
  OpenCampaignAlert,
} from "../types/campaign.types";

export const campaignKeys = {
  all: ["campaigns"] as const,
  summary: () => [...campaignKeys.all, "summary"] as const,
  list: (params: Record<string, unknown>) => [...campaignKeys.all, "list", params] as const,
  detail: (id: string) => [...campaignKeys.all, "detail", id] as const,
  vehicles: (id: string, params?: Record<string, unknown>) => [...campaignKeys.all, "vehicles", id, params ?? {}] as const,
  vehicle: (id: string, vehicleId: string) => [...campaignKeys.all, "vehicle", id, vehicleId] as const,
  openForVehicle: (vehicleId: string) => [...campaignKeys.all, "open-for-vehicle", vehicleId] as const,
};

export type CampaignListParams = { type?: CampaignType; status?: CampaignStatus; search?: string; page?: number; limit?: number };
export type CampaignVehicleParams = { status?: CampaignVehicleStatus; branchId?: string; search?: string; page?: number; limit?: number };

export const getCampaignSummaryRequest = () => apiGet<CampaignSummary>("/campaigns/summary");
export const getCampaignsRequest = (params: CampaignListParams) => apiGet<CampaignList>(`/campaigns${qs(params)}`);
export const getCampaignRequest = async (id: string) => (await apiGet<{ campaign: Campaign }>(`/campaigns/${id}`)).campaign;
export const createCampaignRequest = async (body: CampaignPayload) => (await apiPost<{ campaign: Campaign }>("/campaigns", body)).campaign;
export const updateCampaignRequest = async (id: string, body: Partial<CampaignPayload>) =>
  (await apiPut<{ campaign: Campaign }>(`/campaigns/${id}`, body)).campaign;
export const activateCampaignRequest = async (id: string) => (await apiPost<{ campaign: Campaign }>(`/campaigns/${id}/activate`)).campaign;
export const closeCampaignRequest = async (id: string) => (await apiPost<{ campaign: Campaign }>(`/campaigns/${id}/close`)).campaign;

export const addCampaignVehiclesRequest = (id: string, body: AddVehiclesPayload) => apiPost<AddVehiclesResult>(`/campaigns/${id}/vehicles`, body);
export const getCampaignVehiclesRequest = (id: string, params: CampaignVehicleParams) =>
  apiGet<CampaignVehicleList>(`/campaigns/${id}/vehicles${qs(params)}`);
export const getCampaignVehicleRequest = async (id: string, vehicleId: string) =>
  (await apiGet<{ vehicle: CampaignVehicleDetail }>(`/campaigns/${id}/vehicles/${vehicleId}`)).vehicle;
export const bulkUpdateCampaignVehiclesRequest = (id: string, body: { campaignVehicleIds: string[]; status: CampaignVehicleStatus; notes?: string | null }) =>
  apiPatch<{ updated: number }>(`/campaigns/${id}/vehicles`, body);
export const addContactRequest = async (
  id: string,
  vehicleId: string,
  body: { channel: ContactChannel; outcome: ContactOutcome; notes?: string | null; nextFollowUpAt?: string | null },
) => (await apiPost<{ vehicle: CampaignVehicleDetail }>(`/campaigns/${id}/vehicles/${vehicleId}/contacts`, body)).vehicle;
export const scheduleCampaignVehicleRequest = (id: string, vehicleId: string, body: { scheduledAt: string; branchId: string; notes?: string | null }) =>
  apiPost<{ appointment: { id: string }; vehicle: CampaignVehicleDetail }>(`/campaigns/${id}/vehicles/${vehicleId}/appointment`, body);

export const addVinRangesRequest = (id: string, body: { ranges: { vinFrom: string; vinTo: string }[]; dryRun?: boolean }) =>
  apiPost<AddVinRangesResult>(`/campaigns/${id}/vin-ranges`, body);
export const removeVinRangeRequest = async (id: string, rangeId: string) =>
  (await apiDelete<{ campaign: Campaign }>(`/campaigns/${id}/vin-ranges/${rangeId}`)).campaign;
// ── Manuals, affected VIN download, open-campaign alert ─────────────────────

export const uploadCampaignDocumentRequest = async (id: string, body: { title: string; fileName: string; data: string }) =>
  (await apiPost<{ document: CampaignDocument }>(`/campaigns/${id}/documents`, body)).document;
export const deleteCampaignDocumentRequest = (id: string, documentId: string) => apiDelete<null>(`/campaigns/${id}/documents/${documentId}`);

/** Fetches a file. Error bodies arrive as blobs, so they are parsed back into JSON for the usual error messages. */
async function getFile(url: string): Promise<Blob> {
  try {
    return (await api.get<Blob>(url, { responseType: "blob" })).data;
  } catch (error) {
    const response = (error as { response?: { data?: unknown } }).response;
    if (response?.data instanceof Blob) {
      try {
        response.data = JSON.parse(await response.data.text());
      } catch {
        response.data = undefined;
      }
    }
    throw error;
  }
}

export const getCampaignDocumentFileRequest = (id: string, documentId: string) => getFile(`/campaigns/${id}/documents/${documentId}/file`);
/** Every affected VIN as CSV; customer contacts are included only for outreach roles. */
export const getAffectedVinsFileRequest = (id: string) => getFile(`/campaigns/${id}/vehicles/download`);
export const getOpenCampaignsForVehicleRequest = (vehicleId: string) =>
  apiGet<OpenCampaignAlert>(`/campaigns/open-for-vehicle${qs({ vehicleId })}`);

/** "Record as called": one SENT contact per printed vehicle. */
export const recordPrintedContactsRequest = (body: { campaignVehicleIds: string[]; channel: "LETTER" | "PHONE" }) =>
  apiPost<{ recorded: number; skipped: number }>("/campaigns/contacts/printed", body);
