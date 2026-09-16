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

// Inventory permissions mirror server/src/shared/constants/roles.ts.
export const INVENTORY_PERMISSIONS = {
  SPAREPART_READ: "sparepart:read",
  SPAREPART_CREATE: "sparepart:create",
  SPAREPART_UPDATE: "sparepart:update",
  SPAREPART_DELETE: "sparepart:delete",
  STOCK_READ: "stock:read",
  STOCK_UPDATE: "stock:update",
  INVENTORY_CROSS_BRANCH: "inventory:cross-branch",
  PURCHASEREQUEST_READ: "purchaserequest:read",
  PURCHASEREQUEST_CREATE: "purchaserequest:create",
  PURCHASEREQUEST_UPDATE: "purchaserequest:update",
  PARTISSUANCE_READ: "partissuance:read",
  PARTISSUANCE_CREATE: "partissuance:create",
  PARTRETURN_READ: "partreturn:read",
  PARTRETURN_CREATE: "partreturn:create",
  TRANSFER_READ: "transfer:read",
  TRANSFER_CREATE: "transfer:create",
  TRANSFER_UPDATE: "transfer:update",
  TRANSFER_APPROVE: "transfer:approve",
  TRANSFER_REJECT: "transfer:reject",
  TRANSFER_CANCEL: "transfer:cancel",
  TRANSFER_DISPATCH: "transfer:dispatch",
  TRANSFER_RECEIVE: "transfer:receive",
} as const;

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


// Roles that can see and act on the Enquiry triage queue
export const ENQUIRY_READ_ROLES: AppRole[] = [
  'superadmin',
  'admin',
  'receptionist',
  'receptionmanager',
];

// Roles that can approve/reject enquiries (service:update)
export const ENQUIRY_REVIEW_ROLES: AppRole[] = [
  'superadmin',
  'admin',
  'receptionmanager',
];

// Roles that can create walk-in appointments (service:create)
export const APPOINTMENT_CREATE_ROLES: AppRole[] = [
  'superadmin',
  'admin',
  'receptionist',
  'receptionmanager',
  'serviceadviser',
];