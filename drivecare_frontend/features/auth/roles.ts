// ─── Role type ────────────────────────────────────────────────────────────────
// Normalised to lowercase. Add variants here if the API changes casing.

export type AppRole =
  | "superadmin"
  | "admin"
  | "manager"
  | "technician"
  | "receptionist"
  | "accountant"
  | "viewer";

// ─── Role groups ──────────────────────────────────────────────────────────────
// Single source of truth for every role combination used in access control.
// Import these instead of hard-coding arrays in individual files.

export const FINANCE_ROLES: AppRole[] = ["admin", "manager", "accountant"];
export const WORKSHOP_ROLES: AppRole[] = [
  "admin",
  "manager",
  "technician",
  "receptionist",
];
export const MANAGE_ROLES: AppRole[] = ["admin", "manager"];
export const CUSTOMER_ROLES: AppRole[] = ["admin", "manager", "receptionist"];
export const VEHICLE_ROLES: AppRole[] = [
  "admin",
  "manager",
  "receptionist",
  "technician",
];
export const TECHNICIAN_ROLES: AppRole[] = ["admin", "manager", "technician"];
