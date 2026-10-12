import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryKeys } from "@/features/inventory/api/inventory.keys";
import { apiErrorMessage } from "@/features/stock-transfers/hooks/use-indent-mutations";
import {
  cancelSheetRequest,
  cancelStockTakeRequest,
  completeStockTakeRequest,
  confirmStockTakeRequest,
  correctLineRequest,
  createSheetRequest,
  createStockTakeRequest,
  getBinProposalsRequest,
  getCheckersRequest,
  getLinesRequest,
  getMovementsRequest,
  getSheetRequest,
  getStockTakeRequest,
  getStockTakesRequest,
  recordCountsRequest,
  setNotRequiredRequest,
  stockTakeKeys,
  updateBinsRequest,
  uploadSheetRequest,
  type LineQuery,
  type StockTakeFilters,
} from "../api/stock-taking.api";
import type { CountEntry, CreateSheetPayload, CreateStockTakePayload } from "../types/stock-taking.types";

export function useStockTakes(params: StockTakeFilters = {}) {
  return useQuery({ queryKey: stockTakeKeys.list(params), queryFn: () => getStockTakesRequest(params), placeholderData: keepPreviousData });
}

export function useStockTake(id: string) {
  return useQuery({ queryKey: stockTakeKeys.detail(id), queryFn: () => getStockTakeRequest(id), enabled: !!id });
}

export function useStockTakeLines(id: string, params: LineQuery) {
  return useQuery({
    queryKey: stockTakeKeys.lines(id, params),
    queryFn: () => getLinesRequest(id, params),
    placeholderData: keepPreviousData,
    enabled: !!id,
  });
}

export function useStockTakeMovements(id: string, enabled: boolean) {
  return useQuery({ queryKey: stockTakeKeys.movements(id), queryFn: () => getMovementsRequest(id), enabled: !!id && enabled });
}

export function useBinProposals(id: string, enabled: boolean) {
  return useQuery({ queryKey: stockTakeKeys.bins(id), queryFn: () => getBinProposalsRequest(id), enabled: !!id && enabled });
}

export function useCountSheet(id: string, sheetId: string) {
  return useQuery({ queryKey: stockTakeKeys.sheet(id, sheetId), queryFn: () => getSheetRequest(id, sheetId), enabled: !!id && !!sheetId });
}

export function useCheckers(branchId: string) {
  return useQuery({ queryKey: stockTakeKeys.checkers(branchId), queryFn: () => getCheckersRequest(branchId), enabled: !!branchId, staleTime: 60_000 });
}

/** Counting changes the count's totals; confirming and bin updates change branch stock too. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: stockTakeKeys.all });
    queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
  };
}

function useStockTakeMutation<T, R>(fn: (vars: T) => Promise<R>, success: string | ((result: R) => string), failure: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      refresh();
      toast.success(typeof success === "string" ? success : success(result));
    },
    onError: (error) => toast.error(apiErrorMessage(error, failure)),
  });
}

export function useCreateStockTake() {
  return useStockTakeMutation(
    (payload: CreateStockTakePayload) => createStockTakeRequest(payload),
    ({ stockTake, skipped }) =>
      `Stock taking ${stockTake.batchNumber} created with ${stockTake.summary.lines} part(s)${skipped ? `; ${skipped} already in another open count were left out` : ""}`,
    "Failed to create the stock taking",
  );
}

export function useCancelStockTake(id: string) {
  return useStockTakeMutation((remark: string) => cancelStockTakeRequest(id, remark), "Stock taking cancelled", "Failed to cancel the stock taking");
}

export function useCreateSheet(id: string) {
  return useStockTakeMutation(
    (payload: CreateSheetPayload) => createSheetRequest(id, payload),
    (sheet) => `Count sheet ${sheet.sheetNumber} issued with ${sheet.lineCount} part(s)`,
    "Failed to issue the count sheet",
  );
}

export function useUploadSheet(id: string, sheetId: string) {
  return useStockTakeMutation(
    (payload: { entries: CountEntry[]; uncounted: "ZERO" | "RELEASE" }) => uploadSheetRequest(id, sheetId, payload),
    "Counts uploaded",
    "Failed to upload the counts",
  );
}

export function useCancelSheet(id: string) {
  return useStockTakeMutation(
    ({ sheetId, remark }: { sheetId: string; remark: string }) => cancelSheetRequest(id, sheetId, remark),
    "Count sheet cancelled",
    "Failed to cancel the sheet",
  );
}

export function useRecordCounts(id: string) {
  return useStockTakeMutation((entries: CountEntry[]) => recordCountsRequest(id, entries), "Count recorded", "Failed to record the count");
}

export function useCorrectLine(id: string) {
  return useStockTakeMutation(
    ({ lineId, ...payload }: { lineId: string; countedQuantity: number; damagedQuantity: number; remarks?: string }) =>
      correctLineRequest(id, lineId, payload),
    "Count corrected",
    "Failed to correct the count",
  );
}

export function useSetNotRequired(id: string) {
  return useStockTakeMutation(
    ({ lineId, notRequired }: { lineId: string; notRequired: boolean }) => setNotRequiredRequest(id, lineId, notRequired),
    "Part updated",
    "Failed to update the part",
  );
}

export function useCompleteStockTake(id: string) {
  return useStockTakeMutation(
    (uncounted?: "ZERO" | "REMOVE") => completeStockTakeRequest(id, uncounted),
    "Stock taking completed",
    "Failed to complete the stock taking",
  );
}

export function useConfirmStockTake(id: string) {
  return useStockTakeMutation(() => confirmStockTakeRequest(id), "Shortage and excess confirmed; stock adjusted", "Failed to confirm");
}

export function useUpdateBins(id: string) {
  return useStockTakeMutation(
    (lines: { lineId: string; binLocation: string }[]) => updateBinsRequest(id, lines),
    ({ updated }) => `${updated} bin location(s) updated`,
    "Failed to update the bin locations",
  );
}
