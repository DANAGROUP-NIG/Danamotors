"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Branch {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phoneNumber?: string;
  email?: string;
  isActive?: boolean;
  usersCount?: number;
  location?: string;
}

type BranchState = {
  // data
  branches: Branch[];
  activeBranch: Branch | null;

  // fetch status
  isLoading: boolean;
  isFetched: boolean;
  error: string | null;

  // actions
  setBranches: (branches: Branch[]) => void;
  setActiveBranch: (branch: Branch) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

const initialState = {
  branches: [],
  activeBranch: null,
  isLoading: false,
  isFetched: false,
  error: null,
};

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      ...initialState,

      setBranches: (branches) =>
        set((state) => ({
          branches,
          isLoading: false,
          isFetched: true,
          error: null,
          // keep activeBranch in sync — if current active still exists keep it,
          // otherwise default to first branch
          activeBranch:
            state.activeBranch &&
            branches.some((b) => b.id === state.activeBranch!.id)
              ? state.activeBranch
              : (branches[0] ?? null),
        })),

      setActiveBranch: (branch) => set({ activeBranch: branch }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error, isLoading: false }),

      reset: () => set(initialState),
    }),
    {
      name: "drivecare-active-branch",
      // Only persist the selected branch, not the full list or loading state —
      // the list is always re-fetched from the server on mount.
      partialize: (state) => ({ activeBranch: state.activeBranch }),
    }
  )
);
