"use client";

import { create } from "zustand";
import type { AuthUser } from "@/features/auth/types/auth.types";

type AuthState = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  setUser: (user: AuthUser | null) => void;
  setHydrated: (value: boolean) => void;
  reset: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isHydrated: false,
  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
    }),
  setHydrated: (value) => set({ isHydrated: value }),
  reset: () =>
    set({
      user: null,
      isAuthenticated: false,
      isHydrated: true,
    }),
}));
