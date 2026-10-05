import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api/apiClient";
import { qs } from "@/features/warranty/api/warranty.api";
import type {
  AddVehiclesPayload,
  AddVehiclesResult,
  Campaign,
  CampaignList,
  CampaignPayload,
  CampaignStatus,
  CampaignSummary,
  CampaignType,
  CampaignVehicleDetail,
  CampaignVehicleList,
  CampaignVehicleStatus,
  ContactChannel,
  ContactOutcome,
} from "../types/campaign.types";

export const campaignKeys = {
  all: ["campaigns"] as const,
  summary: () => [...campaignKeys.all, "summary"] as const,
  list: (params: Record<string, unknown>) => [...campaignKeys.all, "list", params] as const,
  detail: (id: string) => [...campaignKeys.all, "detail", id] as const,
  vehicles: (id: string, params?: Record<string, unknown>) => [...campaignKeys.all, "vehicles", id, params ?? {}] as const,
  vehicle: (id: string, vehicleId: string) => [...campaignKeys.all, "vehicle", id, vehicleId] as const,
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
