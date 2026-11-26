// ─── Role type ────────────────────────────────────────────────────────────────
// Normalised to lowercase. Add variants here if the API changes casing.

export type AppRole =
  | "superadmin"
  | "admin"
  | "generalstoremanager"
  | "branchstoremanager"
  | "workshopmanager"
  | "servicemanager"
  | "accountant"
  | "billingofficer"
  | "serviceadviser"
  | "technician"
  | "engineer"
  | "ccuofficer"
  | "ccumanager"
  | "generalccumanager"
  | "warrantyofficer"
  | "auditor"
  | "customer";

// Inventory permissions mirror server/src/shared/constants/roles.ts.
export const INVENTORY_PERMISSIONS = {
  REQUISITION_READ: "requisition:read",
  REQUISITION_CREATE: "requisition:create",
  REQUISITION_CANCEL: "requisition:cancel",
  REQUISITION_GOODWILL: "requisition:goodwill",
  SPAREPART_READ: "sparepart:read",
  SPAREPART_CREATE: "sparepart:create",
  SPAREPART_UPDATE: "sparepart:update",
  SPAREPART_DELETE: "sparepart:delete",
  /** Dealer rates, purchase prices and stock values. */
  SPAREPART_COST_READ: "sparepart:cost:read",
  /** Approve the shortage/excess on an MIT or STN receipt. */
  STOCK_DISCREPANCY_APPROVE: "stock:discrepancy:approve",
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

// Warranty, campaign and job card line permissions mirror server/src/shared/constants/roles.ts.
export const WARRANTY_PERMISSIONS = {
  READ: "warranty:read",
  UPDATE: "warranty:update",
  CLAIM: "warranty:claim",
  SETTINGS: "warranty:settings",
} as const;

export const CAMPAIGN_PERMISSIONS = {
  READ: "campaign:read",
  CREATE: "campaign:create",
  UPDATE: "campaign:update",
  VEHICLE_UPDATE: "campaign:vehicle:update",
} as const;

export const BRANCH_ALL = "branch:all";

/** Mirrors the CSI permission identifiers used by the backend role seed. */
export const CSI_PERMISSIONS = {
  MASTER_READ: "csi:master:read",
  MASTER_UPDATE: "csi:master:update",
  CARD_GENERATE: "csi:card:generate",
  RESPONSE_READ: "csi:response:read",
  RESPONSE_UPDATE: "csi:response:update",
  REPORT: "report:csi",
  ATTRIBUTE_REPORT: "report:csi-attribute",
  CHECKLIST_REPORT: "report:csi-checklist",
} as const;
export const CSI_REPORT_PERMISSIONS = [
  CSI_PERMISSIONS.REPORT,
  CSI_PERMISSIONS.ATTRIBUTE_REPORT,
  CSI_PERMISSIONS.CHECKLIST_REPORT,
] as const;

/**
 * Admin-level permissions (mirrors isAdminLevelPermission in server/src/shared/effectivePermissions.ts):
 * managing users, roles and rights, the audit log, all-branch access and branch management. Only a super
 * admin may grant them to a user.
 */
export function isAdminLevelPermission(name: string): boolean {
  return (
    ["branch:all", "branch:create", "branch:update", "branch:delete"].includes(
      name,
    ) || ["user:", "role:", "audit:"].some((prefix) => name.startsWith(prefix))
  );
}

/** Framework reports (#75) and report settings. */
export const FRAMEWORK_REPORT_PERMISSIONS = [
  ...CSI_REPORT_PERMISSIONS,
  "report:fpc-vehicles",
  "report:fpc-analysis",
  // Service MIS (#97)
  "report:mis-monthly",
  "report:business-product-mix",
  "report:job-analysis",
  "report:group-productivity",
  "report:engineer-performance",
  "report:engineer-part-consumption",
  "report:requisition-return-register",
  "report:major-problems",
  "report:new-customers",
  "report:regular-customers",
  "report:birthday-anniversary",
  "report:vehicle-resale",
  "report:skipped-free-service",
  "report:vehicle-list",
  "report:management-information",
  // Repeat jobs
  "report:repeat-list",
  "report:repeat-analysis",
  "report:repeat-summary",
  // CSC follow-up
  "report:csc-followup",
  "report:csc-not-visited",
  "report:csc-no-show",
  // Late deliveries (promised date / time discrepancy)
  "report:promise-date-discrepancy",
  "report:promise-time-discrepancy",
  "report:promise-date-analysis",
  "report:promise-time-analysis",
  "report:delayed-deliveries",
  // Post-service follow-up (the follow-up list is gated by psf:read; letters and mailing list by psf:letter)
  "psf:read",
  "psf:letter",
  "report:psf-analysis",
  "report:psf-analysis-model",
  "report:psf-dissatisfied",
  "report:psf-closed",
  "report:psf-history",
] as const;
export const REPORT_SETTINGS_PERMISSION = "report:settings";

export const JOBCARD_LINE_UPDATE = "jobcard:line:update";

// CPD part sale: customer purchase orders, counter sales and sale returns.
export const PART_SALE_PERMISSIONS = {
  READ: "partsale:read",
  ORDER: "partsale:order",
  BILL: "partsale:bill",
  RETURN: "partsale:return",
} as const;

// Dispatch challans: unbilled issues of fuel and consumables to internal cost centres.
export const CHALLAN_PERMISSIONS = {
  READ: "challan:read",
  ISSUE: "challan:issue",
  RETURN: "challan:return",
} as const;

// Physical stock taking: batches, count sheets, S/E confirmation.
export const STOCK_TAKE_PERMISSIONS = {
  READ: "stocktake:read",
  MANAGE: "stocktake:manage",
  CONFIRM: "stocktake:confirm",
} as const;

// Stock audit: report only, kept apart so a branch store cannot audit itself.
export const STOCK_AUDIT_PERMISSIONS = {
  READ: "stockaudit:read",
  MANAGE: "stockaudit:manage",
} as const;

// Handheld stations (store PCs that move jobs to the handhelds): register them and issue their keys.
export const HANDHELD_PERMISSIONS = {
  STATIONS: "handheld:stations",
} as const;

// Finance owns the Mobis conversion rate, dealer factor and price bulletins (Finance → Mobis pricing).
export const MOBIS_PRICING_PERMISSIONS = {
  MANAGE: "mobispricing:manage",
} as const;

// Barcode labels on the branch's label printer (a Zebra on a handheld station PC).
export const LABEL_PERMISSIONS = {
  PRINT: "labels:print",
} as const;

// ─── Role groups ──────────────────────────────────────────────────────────────
// Single source of truth for every role combination used in access control.
// Import these instead of hard-coding arrays in individual files.

export const FINANCE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "accountant",
  "billingofficer",
  "serviceadviser",
];

export const WORKSHOP_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "servicemanager",
  "workshopmanager",
  "serviceadviser",
  "technician",
  "ccuofficer",
  "ccumanager",
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
  "billingofficer",
  "serviceadviser",
  "ccuofficer",
  "ccumanager",
  "generalstoremanager",
  "branchstoremanager",
];
export const CUSTOMER_CREATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "serviceadviser",
  "ccuofficer",
  "ccumanager",
];
export const CUSTOMER_UPDATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "serviceadviser",
  "ccumanager",
];
export const VEHICLE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "workshopmanager",
  "serviceadviser",
  "technician",
  "ccuofficer",
  "ccumanager",
  "generalstoremanager",
  "branchstoremanager",
];
export const VEHICLE_CREATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "workshopmanager",
  "serviceadviser",
  "ccuofficer",
  "ccumanager",
];
export const VEHICLE_UPDATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "workshopmanager",
  "serviceadviser",
  "ccumanager",
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
  "ccumanager",
];

// Roles allowed to delete records (no delete for ccuofficer, viewer, etc.)
export const DELETE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "generalstoremanager",
  "workshopmanager",
  "ccumanager",
];

export const INVENTORY_MANAGER_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "generalstoremanager",
  "branchstoremanager",
  "workshopmanager",
];

export const USER_ROLES: AppRole[] = ["superadmin", "admin"];

export const USER_UPDATE_ROLES: AppRole[] = ["superadmin", "admin"];

export const TRANSFER_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "generalstoremanager",
  "branchstoremanager",
];

// Roles that can see and act on the Enquiry triage queue
export const ENQUIRY_READ_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "ccuofficer",
  "ccumanager",
];

// Roles that can approve/reject enquiries (service:update)
export const ENQUIRY_REVIEW_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "ccumanager",
  "ccuofficer",
  "generalccumanager"
];

// Roles that can create walk-in appointments (service:create)
export const APPOINTMENT_CREATE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "ccuofficer",
  "ccumanager",
  "serviceadviser",
];
export const MONTHLY_REPORT_PERMISSIONS = [
  "report:tax-register",
  "report:booked-vs-availed",
  "report:estimate-vs-job",
  "report:unbilled-parts",
  "report:corporate-bills",
  "report:delivered-model",
  "report:delivered-service",
  "report:warranty-attended",
  "report:warranty-parts",
  "report:vehicle-history-card",
] as const;

// Estimate actions are independent API permissions.
export const ESTIMATE_PERMISSIONS = {
  READ: "estimate:read",
  CREATE: "estimate:create",
  REVISE: "estimate:revise",
  PRINT: "estimate:print",
  SIGN: "estimate:sign",
} as const;
