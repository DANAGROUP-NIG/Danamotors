"use client";

import { useEffect } from "react";
import { apiGet } from "@/lib/api/apiClient";
import { useBranchStore, type Branch } from "@/store/branch.store";

interface BranchListResponse {
  branches: Branch[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Fetches branches from the backend once and populates the branch store.
 * Safe to call from multiple components — subsequent calls are no-ops once
 * the data has been fetched.
 */
export function useFetchBranches(enabled = true) {
  const { isFetched, isLoading, setBranches, setLoading, setError } =
    useBranchStore();

  useEffect(() => {
    if (!enabled || isFetched || isLoading) return;

    setLoading(true);

    apiGet<BranchListResponse>("/branches")
      .then((data) => setBranches(data.branches))
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 404) {
          setBranches([]);
          return;
        }
        setError("Failed to load branches");
      });
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
