"use client";

import { useEffect } from "react";
import { apiGet } from "@/lib/api/apiClient";
import { useBranchStore, type Branch } from "@/store/branch.store";

/**
 * Fetches branches from the backend once and populates the branch store.
 * Safe to call from multiple components — subsequent calls are no-ops once
 * the data has been fetched.
 *
 * Only runs when the user is a SuperAdmin (caller's responsibility to gate).
 */
export function useFetchBranches(enabled = true) {
  const { isFetched, isLoading, setBranches, setLoading, setError } =
    useBranchStore();

  useEffect(() => {
    if (!enabled || isFetched || isLoading) return;

    setLoading(true);

    apiGet<Branch[]>("/branches")
      .then((data) => setBranches(data))
      .catch((err) => {
        const status = err?.response?.status;
        // 404 means the endpoint isn't implemented yet — not an error worth surfacing
        if (status === 404) {
          setBranches([]);
          return;
        }
        setError("Failed to load branches");
      });
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
