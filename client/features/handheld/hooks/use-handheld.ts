import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cancelHandheldDocumentRequest, getHandheldDocumentsRequest, handheldKeys } from "../api/handheld.api";
import type { HandheldSourceFilter } from "../types/handheld.types";

function errorMessage(error: unknown, fallback: string) {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export function useHandheldDocuments(filter: HandheldSourceFilter | null) {
  return useQuery({
    queryKey: handheldKeys.forSource(filter ?? { sourceId: "" }),
    queryFn: () => getHandheldDocumentsRequest(filter!),
    enabled: !!filter && Object.values(filter).every(Boolean),
  });
}

export function useCancelHandheldDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, remark }: { id: string; remark: string }) => cancelHandheldDocumentRequest(id, remark),
    onSuccess: (doc) => {
      toast.success(`Handheld document ${doc.documentNumber} cancelled`);
      queryClient.invalidateQueries({ queryKey: handheldKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, "Could not cancel the handheld document")),
  });
}
