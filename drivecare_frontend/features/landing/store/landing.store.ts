"use client";

import { create } from "zustand";

type LandingState = {
  careMode: "standard" | "priority";
  setCareMode: (careMode: "standard" | "priority") => void;
};

export const useLandingStore = create<LandingState>((set) => ({
  careMode: "standard",
  setCareMode: (careMode) => set({ careMode }),
}));
