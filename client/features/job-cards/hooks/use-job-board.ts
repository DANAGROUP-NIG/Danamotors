"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/apiClient";
import { jobCardKeys } from "../api/job-card.keys";
import { boardApiQuery, type BoardFilters } from "../lib/board.logic";
import type { WorkshopBoard } from "../types/job-board.types";

/** Refreshed when the window regains focus and every minute, so the board stays current on a wall screen. */
export const BOARD_REFRESH_MS = 60_000;

export function useJobBoard(filters: BoardFilters, branchId: string | undefined, enabled = true) {
  const query = branchId ? boardApiQuery(filters, branchId) : "";
  return useQuery({
    queryKey: jobCardKeys.board(query),
    queryFn: () => apiGet<WorkshopBoard>(`/service/job-cards/board?${query}`),
    enabled: enabled && !!branchId,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchInterval: BOARD_REFRESH_MS,
    // Offline, say so (with Try again) rather than wait silently.
    networkMode: "always",
    retry: 1,
  });
}
