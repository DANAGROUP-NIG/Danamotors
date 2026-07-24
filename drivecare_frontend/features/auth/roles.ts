// ─── Role type ────────────────────────────────────────────────────────────────
// Normalised to lowercase. Add variants here if the API changes casing.

export type AppRole =
  | "superadmin"
  | "admin"
  | "storemanager"
  | "workshopmanager"
  | "accountant"
  | "serviceadviser"
  | "technician"
  | "receptionist";

// ─── Role groups ──────────────────────────────────────────────────────────────
// Single source of truth for every role combination used in access control.
// Import these instead of hard-coding arrays in individual files.

export const FINANCE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "accountant",
  "serviceadviser",
];

export const WORKSHOP_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "workshopmanager",
  "serviceadviser",
  "technician",
  "receptionist",
];

export const MANAGE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "storemanager",
  "workshopmanager",
];

export const CUSTOMER_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "serviceadviser",
  "receptionist",
];
export const CUSTOMER_CREATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "serviceadviser",
  "receptionist",
];
export const VEHICLE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "workshopmanager",
  "serviceadviser",
  "technician",
  "receptionist",
];
export const VEHICLE_CREATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "workshopmanager",
  "serviceadviser",
  "receptionist",
];
export const TECHNICIAN_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "workshopmanager",
  "technician",
];

export const BRANCH_ROLES: AppRole[] = ["superadmin"];

// Roles allowed to delete records (no delete for receptionist, viewer, etc.)
export const DELETE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "storemanager",
  "workshopmanager",
];
