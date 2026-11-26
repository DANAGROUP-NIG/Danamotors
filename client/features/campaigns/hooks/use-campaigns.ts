import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage, todayInLagos } from "@/features/warranty/lib/warranty-format";
import { downloadFile } from "@/lib/table-actions";
import { warrantyKeys } from "@/features/warranty/api/warranty.keys";
import {
  activateCampaignRequest,
  addCampaignVehiclesRequest,
  addContactRequest,
  addVinRangesRequest,
  bulkUpdateCampaignVehiclesRequest,
  campaignKeys,
  closeCampaignRequest,
  createCampaignRequest,
  deleteCampaignDocumentRequest,
  getAffectedVinsFileRequest,
  getCampaignDocumentFileRequest,
  getCampaignRequest,
  getCampaignSummaryRequest,
  getCampaignVehicleRequest,
  getCampaignVehiclesRequest,
  getCampaignsRequest,
  getOpenCampaignsForVehicleRequest,
  removeVinRangeRequest,
  scheduleCampaignVehicleRequest,
  updateCampaignRequest,
  uploadCampaignDocumentRequest,
  type CampaignListParams,
  type CampaignVehicleParams,
} from "../api/campaign.api";
import type { AddVehiclesPayload, CampaignPayload, CampaignVehicleStatus, ContactChannel, ContactOutcome } from "../types/campaign.types";

export const useCampaignSummary = () => useQuery({ queryKey: campaignKeys.summary(), queryFn: getCampaignSummaryRequest });

export const useCampaigns = (params: CampaignListParams) =>
  useQuery({ queryKey: campaignKeys.list(params), queryFn: () => getCampaignsRequest(params), placeholderData: keepPreviousData });

export const useCampaign = (id: string) => useQuery({ queryKey: campaignKeys.detail(id), queryFn: () => getCampaignRequest(id), enabled: Boolean(id) });

/** Needs campaign:read (customer details); pass enabled=false for manual-only roles. */
export const useCampaignVehicles = (id: string, params: CampaignVehicleParams, enabled = true) =>
  useQuery({
    queryKey: campaignKeys.vehicles(id, params),
    queryFn: () => getCampaignVehiclesRequest(id, params),
    enabled: Boolean(id) && enabled,
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
      toast.success(c.status === "ACTIVE" ? "Campaign activated. Advisers and reception have been notified." : "Campaign closed");
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

type VinRangeInput = { vinFrom: string; vinTo: string };

/** Dry-run summary for VIN ranges (no toast, no cache change). */
export function usePreviewVinRanges(id: string) {
  return useMutation({ mutationFn: (ranges: VinRangeInput[]) => addVinRangesRequest(id, { ranges, dryRun: true }) });
}

export function useAddVinRanges(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (ranges: VinRangeInput[]) => addVinRangesRequest(id, { ranges, dryRun: false }),
    onSuccess: (r) => {
      invalidate();
      toast.success(`Saved ${r.saved} range(s) and added ${r.added.toLocaleString("en-NG")} vehicle(s)`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not save the VIN ranges")),
  });
}

export function useRemoveVinRange(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (rangeId: string) => removeVinRangeRequest(id, rangeId),
    onSuccess: () => {
      invalidate();
      toast.success("VIN range removed. Vehicles it added stay in the campaign.");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not remove the VIN range")),
  });
}

// ── Manuals, affected VIN download, open-campaign alert ─────────────────────

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new Error("The file could not be read. Choose it again."));
    reader.readAsDataURL(file);
  });
}

export function useUploadCampaignDocument(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ title, file }: { title: string; file: File }) =>
      uploadCampaignDocumentRequest(id, { title, fileName: file.name, data: await readAsBase64(file) }),
    onSuccess: (doc) => {
      invalidate();
      toast.success(`Manual "${doc.title}" added to the campaign`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not upload the manual")),
  });
}

export function useDeleteCampaignDocument(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (doc: { id: string; title: string }) => deleteCampaignDocumentRequest(id, doc.id),
    onSuccess: (_r, doc) => {
      invalidate();
      toast.success(`Manual "${doc.title}" removed`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not remove the manual")),
  });
}

export function useDownloadCampaignDocument() {
  return useMutation({
    mutationFn: async (doc: { campaignId: string; id: string; fileName: string }) => {
      downloadFile(await getCampaignDocumentFileRequest(doc.campaignId, doc.id), doc.fileName);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not download the manual")),
  });
}

export function useDownloadAffectedVins() {
  return useMutation({
    mutationFn: async (campaign: { id: string; code: string }) => {
      const code = campaign.code.replace(/[^A-Za-z0-9_-]/g, "") || "campaign";
      downloadFile(await getAffectedVinsFileRequest(campaign.id), `${code}-affected-vins-${todayInLagos()}.csv`);
    },
    onSuccess: () => toast.success("Affected VIN list downloaded"),
    onError: (e) => toast.error(apiErrorMessage(e, "Could not download the affected VIN list")),
  });
}

/** Open campaigns for a vehicle, for the affected-VIN pop-up. Available to every role. */
export const useOpenCampaignsForVehicle = (vehicleId: string | null | undefined, enabled = true) =>
  useQuery({
    queryKey: campaignKeys.openForVehicle(vehicleId ?? ""),
    queryFn: () => getOpenCampaignsForVehicleRequest(vehicleId!),
    enabled: Boolean(vehicleId) && enabled,
    staleTime: 60_000,
  });
