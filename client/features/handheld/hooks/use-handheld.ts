import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cancelHandheldDocumentRequest,
  createHandheldDocumentRequest,
  createStationRequest,
  getHandheldDocumentsRequest,
  getHandheldOverviewRequest,
  getHandheldPickersRequest,
  getHandheldSourcesRequest,
  getStationStateRequest,
  handheldKeys,
  postHandheldDocumentRequest,
  renameDeviceRequest,
  revokeStationRequest,
  rotateStationKeyRequest,
} from "../api/handheld.api";
import type { HandheldDocument, HandheldDocumentType, HandheldShortReason, HandheldSourceFilter } from "../types/handheld.types";

function errorMessage(error: unknown, fallback: string) {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/** A job waiting for or on a handheld changes without anyone touching the page: follow it. */
const following = (docs?: HandheldDocument[]) => docs?.some((d) => d.status === "QUEUED" || d.status === "SENT");

export function useHandheldDocuments(filter: HandheldSourceFilter | null) {
  return useQuery({
    queryKey: handheldKeys.forSource(filter ?? { sourceId: "" }),
    queryFn: () => getHandheldDocumentsRequest(filter!),
    enabled: !!filter && Object.values(filter).every(Boolean),
    refetchInterval: (query) => (following(query.state.data) ? 10_000 : false),
  });
}

/** What can be sent to a handheld now, for one job type (only asked when the user may send that type). */
export function useHandheldSources(type: HandheldDocumentType, enabled: boolean) {
  return useQuery({
    queryKey: handheldKeys.sources(type),
    queryFn: () => getHandheldSourcesRequest(type),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  });
}

export function useStationState(branchId: string | null, enabled = true) {
  return useQuery({
    queryKey: handheldKeys.stationState(branchId ?? ""),
    queryFn: () => getStationStateRequest(branchId!),
    enabled: !!branchId && enabled,
    refetchInterval: enabled ? 15_000 : false,
  });
}

export function useHandheldPickers(branchId: string | null, enabled = true) {
  return useQuery({
    queryKey: handheldKeys.pickers(branchId ?? ""),
    queryFn: () => getHandheldPickersRequest(branchId!),
    enabled: !!branchId && enabled,
    staleTime: 60_000,
  });
}

export function useSendToHandheld() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: HandheldDocumentType; sourceId: string; pickerId?: string; checkerId?: string }) => createHandheldDocumentRequest(body),
    onSuccess: (doc) => {
      toast.success(`Sent: job ${doc.documentNumber} goes to the next handheld docked at ${doc.branch.name}`);
      queryClient.invalidateQueries({ queryKey: handheldKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, "Could not send it to the handheld")),
  });
}

export function usePostHandheldResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; unreportedReason?: HandheldShortReason; uncounted?: "ZERO" | "RELEASE" }) => postHandheldDocumentRequest(id, body),
    onSuccess: (doc) => {
      toast.success(`Handheld result ${doc.documentNumber} posted`);
      // Posting changes the document itself (reservations, back order, MIT status, counts): refresh the page.
      queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(errorMessage(error, "Could not post the handheld result")),
  });
}

export function useCancelHandheldDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, remark }: { id: string; remark: string }) => cancelHandheldDocumentRequest(id, remark),
    onSuccess: (doc) => {
      toast.success(`Handheld job ${doc.documentNumber} cancelled`);
      queryClient.invalidateQueries({ queryKey: handheldKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, "Could not cancel the handheld job")),
  });
}

export function useHandheldOverview(branchId?: string) {
  return useQuery({
    queryKey: handheldKeys.overview(branchId),
    queryFn: () => getHandheldOverviewRequest(branchId),
    refetchInterval: 15_000,
  });
}

export function useCreateStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createStationRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: handheldKeys.all }),
    onError: (error) => toast.error(errorMessage(error, "Could not register the station")),
  });
}

export function useRotateStationKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rotateStationKeyRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: handheldKeys.all }),
    onError: (error) => toast.error(errorMessage(error, "Could not issue a new key")),
  });
}

export function useRevokeStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeStationRequest,
    onSuccess: (s) => {
      toast.success(`Station ${s.name} revoked`);
      queryClient.invalidateQueries({ queryKey: handheldKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, "Could not revoke the station")),
  });
}

export function useRenameDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameDeviceRequest(id, name),
    onSuccess: (d) => {
      toast.success(`Handheld renamed ${d.name}`);
      queryClient.invalidateQueries({ queryKey: handheldKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, "Could not rename the handheld")),
  });
}
