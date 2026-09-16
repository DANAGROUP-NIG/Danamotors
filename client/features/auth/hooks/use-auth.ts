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

  const permissions: string[] = user?.permissions ?? [];

  // Convenience booleans
  const isSuperAdmin = role === "superadmin";
  const isAdmin = role === "admin";
  const isStoreManager = role === "generalstoremanager" || role === "branchstoremanager";
  const isGeneralStoreManager = role === "generalstoremanager";
  const isBranchStoreManager = role === "branchstoremanager";
  const isWorkshopManager = role === "workshopmanager";
  const isAdviser = role === "serviceadviser";
  const isTechnician = role === "technician";
  const isReceptionist = role === "receptionist";
  const isReceptionManager = role === "receptionmanager";
  const isAccountant = role === "accountant";
  const isCustomer = role === "customer";
  const customerId = user?.customerId || (isCustomer ? user?.id : undefined);

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

  /**
   * hasPermission("customer:create")
   * Returns true when the user's permissions array contains the given permission.
   * SuperAdmin always has all permissions.
   * Returns false if permissions haven't loaded yet (user not hydrated).
   */
  function hasPermission(permission: string): boolean {
    if (!isHydrated) return false;
    if (isSuperAdmin) return true;
    return permissions.includes(permission);
  }

  /**
   * hasAnyPermission(["customer:read", "customer:create"])
   * Returns true when the user has ANY of the listed permissions.
   */
  function hasAnyPermission(perms: string[]): boolean {
    if (!perms.length) return true;
    if (!isHydrated) return false;
    if (isSuperAdmin) return true;
    return perms.some((p) => permissions.includes(p));
  }

  return {
    user,
    role,
    permissions,
    isAuthenticated,
    isHydrated,
    // individual role flags
    isSuperAdmin,
    isAdmin,
    isStoreManager,
    isGeneralStoreManager,
    isBranchStoreManager,
    isWorkshopManager,
    isAdviser,
    isTechnician,
    isReceptionist,
    isReceptionManager,
    isAccountant,
    isCustomer,
    customerId,

    // composite flags
    isAdminOrAbove,
    isManagerOrAbove,
    isAdviserOrAbove,
    // generic checkers
    hasAccess,
    hasPermission,
    hasAnyPermission,
  };
}
