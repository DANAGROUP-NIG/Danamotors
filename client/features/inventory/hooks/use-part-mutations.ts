import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryKeys } from "../api/inventory.keys";
import {
  adjustStockRequest,
  createAlternateRequest,
  createPartRequest,
  deletePartRequest,
  updatePartRequest,
  updateStockLocationRequest,
} from "../api/inventory.api";
import type {
  AlternatePartPayload,
  PartMaster,
  PartMasterPayload,
  StockLocationPayload,
  UpdatePartMasterPayload,
} from "../types/inventory.types";

type ApiError = {
  response?: { status?: number; data?: { message?: string; errors?: { field?: string; message: string }[] } };
};

/** Turns backend errors into messages a store user can act on. */
export function partErrorMessage(error: unknown, fallback: string): string {
  const data = (error as ApiError)?.response?.data;
  const message = data?.errors?.[0]
    ? `${data.errors[0].field ? `${data.errors[0].field}: ` : ""}${data.errors[0].message}`
    : data?.message;
  if (!message) return fallback;
  if (message === "Foreign key constraint failed") {
    return "This part is still used by stock, transactions, transfers or alternate parts, so it cannot be deleted. Block it instead.";
  }
  const duplicate = message.match(/^Duplicate field value: (.+)$/);
  if (duplicate) {
    const field = duplicate[1].includes("partNumber") ? "part number" : duplicate[1];
    return `Another part already uses this ${field}.`;
  }
  return message;
}

function useInvalidateParts() {
  const queryClient = useQueryClient();
  return (part?: PartMaster) => {
    queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    if (part) queryClient.setQueryData(inventoryKeys.detail(part.id), part);
  };
}

export function useCreatePart() {
  const refresh = useInvalidateParts();
  return useMutation({
    mutationFn: (payload: PartMasterPayload) => createPartRequest(payload),
    onSuccess: (part) => {
      refresh(part);
      toast.success(`Part ${part.partNumber} created`);
    },
    onError: (error) => toast.error(partErrorMessage(error, "Failed to create part")),
  });
}

export function useUpdatePart(id: string) {
  const refresh = useInvalidateParts();
  return useMutation({
    mutationFn: (payload: UpdatePartMasterPayload) => updatePartRequest(id, payload),
    onSuccess: (part) => {
      refresh(part);
      toast.success(`Part ${part.partNumber} updated`);
    },
    onError: (error) => toast.error(partErrorMessage(error, "Failed to update part")),
  });
}

export function useSetPartStatus() {
  const refresh = useInvalidateParts();
  return useMutation({
    mutationFn: ({ id, partStatus }: { id: string; partStatus: PartMaster["partStatus"] }) =>
      updatePartRequest(id, { partStatus }),
    onSuccess: (part) => {
      refresh(part);
      toast.success(`${part.partNumber} is now ${part.partStatus === "ACTIVE" ? "active" : "blocked"}`);
    },
    onError: (error) => toast.error(partErrorMessage(error, "Failed to change part status")),
  });
}

export function useDeletePart() {
  const refresh = useInvalidateParts();
  return useMutation({
    mutationFn: (id: string) => deletePartRequest(id),
    onSuccess: () => {
      refresh();
      toast.success("Part deleted");
    },
    onError: (error) => toast.error(partErrorMessage(error, "Failed to delete part")),
  });
}

export function useCreateAlternate(mainPartId: string) {
  const refresh = useInvalidateParts();
  return useMutation({
    mutationFn: (payload: AlternatePartPayload) => createAlternateRequest(mainPartId, payload),
    onSuccess: (part) => {
      refresh();
      toast.success(`Alternate ${part.partNumber} added`);
    },
    onError: (error) => toast.error(partErrorMessage(error, "Failed to add alternate part")),
  });
}

/** Records opening stock for a new part at one or more branches. */
export function useOpeningStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entries: { branchId: string; partId: string; quantity: number }[]) => {
      for (const entry of entries) {
        await adjustStockRequest({ ...entry, type: "STOCKED", notes: "Opening stock" });
      }
      return entries.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      if (count) toast.success(`Opening stock recorded at ${count} ${count === 1 ? "branch" : "branches"}`);
    },
    onError: (error) =>
      toast.error(partErrorMessage(error, "The part was created, but opening stock could not be recorded")),
  });
}

export function useUpdateStockLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, partId, payload }: { branchId: string; partId: string; payload: StockLocationPayload }) =>
      updateStockLocationRequest(branchId, partId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success("Stock location updated");
    },
    onError: (error) => toast.error(partErrorMessage(error, "Failed to update stock location")),
  });
}
