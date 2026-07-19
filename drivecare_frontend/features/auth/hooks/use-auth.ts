"use client";

import { useAuthStore } from "@/store/auth.store";

// ─── Role constants ────────────────────────────────────────────────────────────
// Normalised to lowercase. Add variants here if the API changes casing.

export type AppRole =
  | "superadmin"
  | "admin"
  | "manager"
  | "technician"
  | "receptionist"
  | "accountant"
  | "viewer";

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const user         = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated   = useAuthStore((s) => s.isHydrated);

  // Normalise whatever the API returns → lowercase
  const role = (user?.role?.toLowerCase().replace(/[\s-]/g, "_") ?? null) as AppRole | null;

  // Convenience booleans
  const isSuperAdmin  = role === "superadmin";
  const isAdmin       = role === "admin";
  const isManager     = role === "manager";
  const isTechnician  = role === "technician";
  const isReceptionist = role === "receptionist";
  const isAccountant  = role === "accountant";
  const isViewer      = role === "viewer";

  // Hierarchy shorthand: "admin or above"
  const isAdminOrAbove    = isSuperAdmin || isAdmin;
  const isManagerOrAbove  = isAdminOrAbove || isManager;

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
    isManager,
    isTechnician,
    isReceptionist,
    isAccountant,
    isViewer,
    // composite flags
    isAdminOrAbove,
    isManagerOrAbove,
    // generic checker
    hasAccess,
  };
}
