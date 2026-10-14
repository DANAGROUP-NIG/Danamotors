import { apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";
import type { PartSearchResult } from "@/features/stock-transfers/types/indent.types";
import type {
  BinProposal,
  CandidatePart,
  Checker,
  CountEntry,
  CountSheet,
  CreateSheetPayload,
  CreateStockTakePayload,
  Kind,
  LineFilter,
  LinePage,
  Movement,
  PartSelection,
  SheetDetail,
  StockTake,
  StockTakeListItem,
  StockTakeStatus,
  StockTakeType,
} from "../types/stock-taking.types";

const BASE = "/stock-takes";

export const stockTakeKeys = {
  all: ["stock-takes"] as const,
  list: (params: Record<string, unknown>) => [...stockTakeKeys.all, "list", params] as const,
  detail: (id: string) => [...stockTakeKeys.all, "detail", id] as const,
  lines: (id: string, params: Record<string, unknown>) => [...stockTakeKeys.all, "lines", id, params] as const,
  movements: (id: string) => [...stockTakeKeys.all, "movements", id] as const,
  bins: (id: string) => [...stockTakeKeys.all, "bins", id] as const,
  sheet: (id: string, sheetId: string) => [...stockTakeKeys.all, "sheet", id, sheetId] as const,
  checkers: (branchId: string) => [...stockTakeKeys.all, "checkers", branchId] as const,
  parts: (search: string, branchId: string) => [...stockTakeKeys.all, "parts", search, branchId] as const,
};

function qs(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const s = query.toString();
  return s ? `?${s}` : "";
}

export async function searchStockTakePartsRequest(search: string, branchId: string) {
  return (await apiGet<{ parts: PartSearchResult[] }>(`${BASE}/parts${qs({ search, branchId })}`)).parts;
}

export async function getCheckersRequest(branchId: string) {
  return (await apiGet<{ checkers: Checker[] }>(`${BASE}/checkers${qs({ branchId })}`)).checkers;
}

export async function previewPartsRequest(branchId: string, selection: PartSelection, kind: Kind) {
  return (await apiPost<{ parts: CandidatePart[] }>(`${BASE}/preview`, { branchId, selection, kind })).parts;
}

export type StockTakeFilters = { kind?: Kind; status?: StockTakeStatus; type?: StockTakeType; search?: string };

export async function getStockTakesRequest(params: StockTakeFilters = {}) {
  return (await apiGet<{ stockTakes: StockTakeListItem[] }>(`${BASE}${qs(params)}`)).stockTakes;
}

export async function getStockTakeRequest(id: string) {
  return (await apiGet<{ stockTake: StockTake }>(`${BASE}/${id}`)).stockTake;
}

export type LineQuery = { search?: string; filter?: LineFilter; page?: number; pageSize?: number };

export async function getLinesRequest(id: string, params: LineQuery) {
  return apiGet<LinePage>(`${BASE}/${id}/lines${qs(params)}`);
}

export async function getMovementsRequest(id: string) {
  return (await apiGet<{ movements: Movement[] }>(`${BASE}/${id}/movements`)).movements;
}

export async function createStockTakeRequest(payload: CreateStockTakePayload) {
  return apiPost<{ stockTake: StockTake; skipped: number }>(BASE, payload);
}

export async function cancelStockTakeRequest(id: string, remark: string) {
  return (await apiPatch<{ stockTake: StockTake }>(`${BASE}/${id}/cancel`, { remark })).stockTake;
}

export async function createSheetRequest(id: string, payload: CreateSheetPayload) {
  return (await apiPost<{ sheet: CountSheet }>(`${BASE}/${id}/sheets`, payload)).sheet;
}

export async function getSheetRequest(id: string, sheetId: string) {
  return (await apiGet<{ sheet: SheetDetail }>(`${BASE}/${id}/sheets/${sheetId}`)).sheet;
}

export async function uploadSheetRequest(id: string, sheetId: string, payload: { entries: CountEntry[]; uncounted: "ZERO" | "RELEASE" }) {
  return (await apiPost<{ stockTake: StockTake }>(`${BASE}/${id}/sheets/${sheetId}/upload`, payload)).stockTake;
}

export async function cancelSheetRequest(id: string, sheetId: string, remark: string) {
  return (await apiPatch<{ stockTake: StockTake }>(`${BASE}/${id}/sheets/${sheetId}/cancel`, { remark })).stockTake;
}

export async function recordCountsRequest(id: string, entries: CountEntry[]) {
  return (await apiPost<{ stockTake: StockTake }>(`${BASE}/${id}/counts`, { entries })).stockTake;
}

export async function correctLineRequest(id: string, lineId: string, payload: { countedQuantity: number; damagedQuantity: number; remarks?: string }) {
  return (await apiPatch<{ stockTake: StockTake }>(`${BASE}/${id}/lines/${lineId}`, payload)).stockTake;
}

export async function setNotRequiredRequest(id: string, lineId: string, notRequired: boolean) {
  return (await apiPatch<{ stockTake: StockTake }>(`${BASE}/${id}/lines/${lineId}/not-required`, { notRequired })).stockTake;
}

export async function completeStockTakeRequest(id: string, uncounted?: "ZERO" | "REMOVE") {
  return (await apiPatch<{ stockTake: StockTake }>(`${BASE}/${id}/complete`, { uncounted })).stockTake;
}

export async function confirmStockTakeRequest(id: string) {
  return (await apiPatch<{ stockTake: StockTake }>(`${BASE}/${id}/confirm`)).stockTake;
}

export async function getBinProposalsRequest(id: string) {
  return (await apiGet<{ bins: BinProposal[] }>(`${BASE}/${id}/bins`)).bins;
}

export async function updateBinsRequest(id: string, lines: { lineId: string; binLocation: string }[]) {
  return apiPatch<{ stockTake: StockTake; updated: number }>(`${BASE}/${id}/bins`, { lines });
}
