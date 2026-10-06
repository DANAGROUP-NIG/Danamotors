import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { warrantyKeys } from "@/features/warranty/api/warranty.keys";
import {
  activateCampaignRequest,
  addCampaignVehiclesRequest,
  addContactRequest,
  bulkUpdateCampaignVehiclesRequest,
  campaignKeys,
  closeCampaignRequest,
  createCampaignRequest,
  getCampaignRequest,
  getCampaignSummaryRequest,
  getCampaignVehicleRequest,
  getCampaignVehiclesRequest,
  getCampaignsRequest,
  scheduleCampaignVehicleRequest,
  updateCampaignRequest,
  type CampaignListParams,
  type CampaignVehicleParams,
} from "../api/campaign.api";
import type { AddVehiclesPayload, CampaignPayload, CampaignVehicleStatus, ContactChannel, ContactOutcome } from "../types/campaign.types";

export const useCampaignSummary = () => useQuery({ queryKey: campaignKeys.summary(), queryFn: getCampaignSummaryRequest });

export const useCampaigns = (params: CampaignListParams) =>
  useQuery({ queryKey: campaignKeys.list(params), queryFn: () => getCampaignsRequest(params), placeholderData: keepPreviousData });

export const useCampaign = (id: string) => useQuery({ queryKey: campaignKeys.detail(id), queryFn: () => getCampaignRequest(id), enabled: Boolean(id) });

export const useCampaignVehicles = (id: string, params: CampaignVehicleParams) =>
  useQuery({
    queryKey: campaignKeys.vehicles(id, params),
    queryFn: () => getCampaignVehiclesRequest(id, params),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });

export const useCampaignVehicle = (id: string, vehicleId: string | null) =>
  useQuery({
    queryKey: campaignKeys.vehicle(id, vehicleId ?? ""),
    queryFn: () => getCampaignVehicleRequest(id, vehicleId!),
    enabled: Boolean(id && vehicleId),
  });

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: campaignKeys.all });
    qc.invalidateQueries({ queryKey: warrantyKeys.vehicles() });
  };
}

export function useSaveCampaign(id?: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CampaignPayload) => (id ? updateCampaignRequest(id, body) : createCampaignRequest(body)),
    onSuccess: (c) => {
      invalidate();
      toast.success(id ? "Campaign updated" : `Campaign ${c.code} created`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not save the campaign")),
  });
}

export function useCampaignStatus(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (action: "activate" | "close") => (action === "activate" ? activateCampaignRequest(id) : closeCampaignRequest(id)),
    onSuccess: (c) => {
      invalidate();
      toast.success(c.status === "ACTIVE" ? "Campaign activated — advisers and reception have been notified" : "Campaign closed");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not update the campaign")),
  });
}

/** Dry-run validation for the add-vehicles dialog (no toast, no cache change). */
export function usePreviewVehicles(id: string) {
  return useMutation({ mutationFn: (body: AddVehiclesPayload) => addCampaignVehiclesRequest(id, { ...body, dryRun: true }) });
}

export function useAddCampaignVehicles(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: AddVehiclesPayload) => addCampaignVehiclesRequest(id, { ...body, dryRun: false }),
    onSuccess: (r) => {
      invalidate();
      toast.success(`Added ${r.added.toLocaleString("en-NG")} vehicle(s)`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not add the vehicles")),
  });
}

export function useBulkUpdateCampaignVehicles(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { campaignVehicleIds: string[]; status: CampaignVehicleStatus; notes?: string | null }) => bulkUpdateCampaignVehiclesRequest(id, body),
    onSuccess: (r) => {
      invalidate();
      toast.success(`Updated ${r.updated} vehicle(s)`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not update the vehicles")),
  });
}

export function useAddContact(id: string, vehicleId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { channel: ContactChannel; outcome: ContactOutcome; notes?: string | null; nextFollowUpAt?: string | null }) =>
      addContactRequest(id, vehicleId, body),
    onSuccess: () => {
      invalidate();
      toast.success("Contact recorded");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not record the contact")),
  });
}

export function useScheduleCampaignVehicle(id: string, vehicleId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { scheduledAt: string; branchId: string; notes?: string | null }) => scheduleCampaignVehicleRequest(id, vehicleId, body),
    onSuccess: () => {
      invalidate();
      toast.success("Appointment booked");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not book the appointment")),
  });
}
