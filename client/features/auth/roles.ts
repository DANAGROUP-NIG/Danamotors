// ─── Role type ────────────────────────────────────────────────────────────────
// Normalised to lowercase. Add variants here if the API changes casing.

export type AppRole =
  | "superadmin"
  | "admin"
  | "generalstoremanager"
  | "branchstoremanager"
  | "workshopmanager"
  | "accountant"
  | "serviceadviser"
  | "technician"
  | "receptionist"
  | "receptionmanager"
  | "customer";

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
  "receptionmanager",
  "generalstoremanager",
  "branchstoremanager",
];

export const MANAGE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "generalstoremanager",
  "branchstoremanager",
  "workshopmanager",
];

export const CUSTOMER_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "serviceadviser",
  "receptionist",
  "receptionmanager",
  "generalstoremanager",
  "branchstoremanager",
];
export const CUSTOMER_CREATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "serviceadviser",
  "receptionist",
  "receptionmanager",
];
export const CUSTOMER_UPDATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "serviceadviser",
  "receptionmanager",
];
export const VEHICLE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "workshopmanager",
  "serviceadviser",
  "technician",
  "receptionist",
  "receptionmanager",
  "generalstoremanager",
  "branchstoremanager",
];
export const VEHICLE_CREATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "workshopmanager",
  "serviceadviser",
  "receptionist",
  "receptionmanager",
];
export const VEHICLE_UPDATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "workshopmanager",
  "serviceadviser",
  "receptionmanager",
];
export const TECHNICIAN_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "workshopmanager",
  "technician",
];

export const BRANCH_ROLES: AppRole[] = ["superadmin"];

export const SERVICES_MANAGE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "workshopmanager",
];

export const SERVICE_CREATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "workshopmanager",
  "serviceadviser",
  "generalstoremanager",
  "branchstoremanager",
];

export const SERVICE_UPDATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "serviceadviser",
  "workshopmanager",
  "technician",
];

export const APPOINTMENT_UPDATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "serviceadviser",
  "workshopmanager",
  "technician",
  "receptionmanager",
];

// Roles allowed to delete records (no delete for receptionist, viewer, etc.)
export const DELETE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "generalstoremanager",
  "workshopmanager",
  "receptionmanager",
];

export const INVENTORY_MANAGER_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "generalstoremanager",
  "branchstoremanager",
  "workshopmanager",
];

export const USER_ROLES: AppRole[] = [
  "superadmin",
  "admin",
];

export const USER_UPDATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
];

export const TRANSFER_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "generalstoremanager",
  "branchstoremanager",
];
