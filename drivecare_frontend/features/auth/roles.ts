// ─── Role type ────────────────────────────────────────────────────────────────
// Normalised to lowercase. Add variants here if the API changes casing.

export type AppRole =
  | "superadmin"
  | "admin"
  | "manager"
  | "technician"
  | "receptionist"
  | "accountant"
  | "viewer"
  | "workshopmanager"
  | "serviceadvisor"
  | "storemanager";

// ─── Role groups ──────────────────────────────────────────────────────────────
// Single source of truth for every role combination used in access control.
// Import these instead of hard-coding arrays in individual files.

export const FINANCE_ROLES: AppRole[] = ["admin", "manager", "accountant", "serviceadvisor"];
export const WORKSHOP_ROLES: AppRole[] = [
  "admin",
  "manager",
  "technician",
  "receptionist",
  "workshopmanager",
  "serviceadvisor",
  "storemanager",
];
export const MANAGE_ROLES: AppRole[] = ["admin", "manager"];
export const CUSTOMER_ROLES: AppRole[] = ["admin", "manager", "receptionist", "serviceadvisor"];
export const VEHICLE_ROLES: AppRole[] = [
  "admin",
  "manager",
  "receptionist",
  "technician",
  "serviceadvisor",
  "storemanager",
];
export const TECHNICIAN_ROLES: AppRole[] = ["admin", "manager", "technician", "workshopmanager"];
export const BRANCH_ROLES: AppRole[] = ["superadmin"];

// Roles allowed to delete records (no delete for receptionist, viewer, etc.)
export const DELETE_ROLES: AppRole[] = ["superadmin", "admin", "manager", "workshopmanager"];
