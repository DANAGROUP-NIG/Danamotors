"use client";

import { useAuthStore } from "@/store/auth.store";
import { type AppRole } from "../roles";

export type { AppRole };

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  // Normalise whatever the API returns → lowercase
  const role = (user?.role?.toLowerCase().replace(/[\s-]/g, "_") ??
    null) as AppRole | null;

  // Convenience booleans
  const isSuperAdmin = role === "superadmin";
  const isAdmin = role === "admin";
  const isStoreManager = role === "storemanager";
  const isWorkshopManager = role === "workshopmanager";
  const isAdviser = role === "serviceadviser";
  const isTechnician = role === "technician";
  const isReceptionist = role === "receptionist";
  const isReceptionManager = role === "receptionmanager";
  const isAccountant = role === "accountant";

  // Hierarchy shorthand: "admin or above"
  const isAdminOrAbove = isSuperAdmin || isAdmin;
  const isManagerOrAbove = isStoreManager || isWorkshopManager;
  const isAdviserOrAbove = isManagerOrAbove || isAdviser;
  /**
   * hasAccess(["superadmin", "admin"])
   * Returns true when the current user's role matches ANY of the provided roles.
   * Pass an empty array or omit to allow everyone.
   */
  function hasAccess(allowedRoles: AppRole[]): boolean {
    if (!allowedRoles.length) return true;
    if (!role) return false;

    // superadmin always passes
    if (isSuperAdmin) return true;
    return allowedRoles.includes(role);
  }

  return {
    user,
    role,
    isAuthenticated,
    isHydrated,
    // individual role flags
    isSuperAdmin,
    isAdmin,
    isTechnician,
    isReceptionist,
    isReceptionManager,
    isAccountant,

    // composite flags
    isAdminOrAbove,
    isManagerOrAbove,
    isAdviserOrAbove,
    // generic checker
    hasAccess,
  };
}
