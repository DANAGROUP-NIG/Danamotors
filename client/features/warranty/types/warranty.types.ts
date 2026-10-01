// Mirrors server/src/modules/warranty (coverage, cases, codes, models).

export type CoverageStatus = "ACTIVE" | "EXPIRED_DATE" | "EXPIRED_MILEAGE" | "NOT_COVERED" | "UNKNOWN";
export type CoverageSource = "MODEL" | "EXTENDED" | "GOODWILL";
export type CampaignType = "RECALL" | "FREE_FIX" | "SERVICE_CAMPAIGN";
export type CampaignVehicleStatus = "PENDING" | "CONTACTED" | "SCHEDULED" | "COMPLETED" | "NOT_REACHABLE" | "NOT_APPLICABLE";

export type Person = { id: string; firstName: string; lastName: string };

export type Coverage = {
  status: CoverageStatus;
  reasons: string[];
  source: CoverageSource | null;
  /** YYYY-MM-DD */
  startDate: string | null;
  /** Last covered day, YYYY-MM-DD */
  expiresOn: string | null;
  warrantyDays: number | null;
  kmLimit: number | null;
  mileage: number | null;
  remainingDays: number | null;
  remainingKm: number | null;
  daysUsedPercent: number | null;
  kmUsedPercent: number | null;
};

export type OpenCampaign = {
  campaignId: string;
  campaignVehicleId: string;
  code: string;
  title: string;
  type: CampaignType;
  description: string | null;
  defectDescription: string | null;
  startDate: string;
  endDate: string | null;
  vehicleStatus: CampaignVehicleStatus;
  scheduledAt: string | null;
};

export type WarrantyCheck = {
  vehicle: {
    id: string;
    vin: string;
    registrationNumber: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    trim: string | null;
    lastRecordedMileage: number | null;
    lastMileageAt: string | null;
  };
  policy: {
    id: string;
    code?: string;
    name?: string;
    warrantyDays: number | null;
    warrantyKm: number | null;
    warrantyCovered: boolean;
  } | null;
  override: { type: "EXTENDED" | "GOODWILL"; until: string | null; km: number | null; reason: string | null } | null;
  coverage: Coverage;
  reasonText: string[];
  openCampaigns: OpenCampaign[];
  requiresAcknowledgement: boolean;
  mileageWarning: string | null;
};

export type VehicleModel = {
  id: string;
  code: string;
  make: string;
  name: string;
  warrantyDays: number | null;
  warrantyKm: number | null;
  warrantyCovered: boolean;
  isActive: boolean;
  vehiclesLinked?: number;
};

export type VehicleModelPayload = {
  code: string;
  make?: string;
  name: string;
  warrantyDays?: number | null;
  warrantyKm?: number | null;
  warrantyCovered?: boolean;
  isActive?: boolean;
};

export type UpdateVehicleWarrantyPayload = {
  vehicleModelId?: string | null;
  warrantyStartDate?: string | null;
  override?: { type: "EXTENDED" | "GOODWILL"; until?: string | null; km?: number | null; reason: string } | null;
};

// ── Codes ────────────────────────────────────────────────────────────────────

export type CodeType = "complaint" | "defect" | "position" | "reject";

export type WarrantyCode = { id: string; code: string; description: string; isActive: boolean };

export type WarrantyCodes = Record<CodeType, WarrantyCode[]>;

// ── Cases ────────────────────────────────────────────────────────────────────

export type CaseStatus =
  | "OPEN"
  | "IN_REVIEW"
  | "SUBMITTED"
  | "APPROVED"
  | "PARTIALLY_APPROVED"
  | "REJECTED"
  | "RETURNED"
  | "SETTLED"
  | "CLOSED";

export type CaseAction =
  | "START_REVIEW"
  | "SUBMIT"
  | "APPROVE"
  | "PARTIALLY_APPROVE"
  | "REJECT"
  | "RETURN"
  | "RESUME"
  | "SETTLE"
  | "CLOSE";

export type LineKind = "PART" | "LABOUR";
export type LineRole = "CAUSAL" | "CONSEQUENTIAL";

export type CaseLine = {
  id: string;
  seq: number;
  kind: LineKind;
  role: LineRole | null;
  sparePartId: string | null;
  partNumber: string | null;
  operationCode: string | null;
  description: string;
  defectCode: WarrantyCode | null;
  defectCodeId: string | null;
  positionCode: WarrantyCode | null;
  positionCodeId: string | null;
  batchNo: string | null;
  quantity: number;
  rate: number;
  claimedAmount: number;
  approvalPercent: number;
  approvedAmount: number | null;
  jobCardLineId: string | null;
  sparePart: { id: string; partNumber: string; name: string; warrantyApplicable: boolean } | null;
};

export type ProgressStep = {
  key: string;
  label: string;
  completed: boolean;
  skipped: boolean;
  at: string | null;
  by: Person | null;
};

export type StatusHistoryEntry = {
  id: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus;
  remarks: string | null;
  createdAt: string;
  actor: Person | null;
};

export type WarrantyCase = {
  id: string;
  caseNumber: string;
  status: CaseStatus;
  openedAutomatically: boolean;
  branchId: string;
  complaint: string | null;
  complaintCodeId: string | null;
  complaintCode: WarrantyCode | null;
  mileage: number | null;
  coverageStatus: CoverageStatus | null;
  manufacturerClaimNo: string | null;
  manufacturerClaimDate: string | null;
  submittedAt: string | null;
  decisionAt: string | null;
  rejectReason: WarrantyCode | null;
  rejectReasonId: string | null;
  claimedAmount: number;
  approvedAmount: number | null;
  settledAt: string | null;
  settlementRef: string | null;
  settledAmount: number | null;
  closedAt: string | null;
  createdAt: string;
  billDate: string | null;
  jobCard: {
    id: string;
    jobNumber: string;
    description: string;
    status: string;
    createdAt: string;
    mileage: number | null;
    warrantyStatusAtCreation: CoverageStatus | null;
  } | null;
  vehicle: {
    id: string;
    vin: string;
    registrationNumber: string | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    year: number | null;
    warrantyStartDate: string | null;
    vehicleModel: { id: string; code: string; name: string } | null;
  };
  customer: { id: string; firstName: string; lastName: string; email: string; phoneNumber: string | null } | null;
  branch: { id: string; name: string };
  assignedOfficer: Person | null;
  createdBy: Person | null;
  lines: CaseLine[];
  statusHistory: StatusHistoryEntry[];
  allowedActions: CaseAction[];
  editable: boolean;
  progress: ProgressStep[];
};

export type WarrantyCaseListItem = {
  id: string;
  caseNumber: string;
  status: CaseStatus;
  mileage: number | null;
  manufacturerClaimNo: string | null;
  claimedAmount: number;
  approvedAmount: number | null;
  createdAt: string;
  jobCard: { id: string; jobNumber: string } | null;
  vehicle: { id: string; vin: string; make: string | null; model: string | null; trim: string | null; registrationNumber: string | null };
  customer: { id: string; firstName: string; lastName: string } | null;
  branch: { id: string; name: string };
};

export type WarrantyCaseList = { items: WarrantyCaseListItem[]; total: number; page: number; limit: number };

export type WarrantySummary = {
  open: number;
  inReview: number;
  submitted: number;
  submittedClaimedAmount: number;
  approvedLast30Days: number;
  approvedLast30DaysAmount: number;
  rejectedOrReturned: number;
};

export type CaseListParams = {
  status?: CaseStatus;
  branchId?: string;
  from?: string;
  to?: string;
  basedOn?: "CASE_DATE" | "BILL_DATE";
  claimNo?: "GENERATED" | "NOT_GENERATED";
  billing?: "BILLED" | "UNBILLED";
  search?: string;
  page?: number;
  limit?: number;
};

export type CaseLinePayload = {
  kind: LineKind;
  role?: LineRole | null;
  sparePartId?: string | null;
  operationCode?: string | null;
  description?: string | null;
  defectCodeId?: string | null;
  positionCodeId?: string | null;
  batchNo?: string | null;
  quantity: number;
  rate?: number | null;
};

export type TransitionPayload = {
  action: CaseAction;
  remarks?: string | null;
  rejectReasonId?: string | null;
  settlementRef?: string | null;
  settledAmount?: number | null;
  settledAt?: string | null;
  decisionAt?: string | null;
  manufacturerClaimNo?: string | null;
  manufacturerClaimDate?: string | null;
  lineApprovals?: { lineId: string; approvalPercent: number }[];
};

export type WarrantyPart = {
  id: string;
  partNumber: string;
  name: string;
  warrantyApplicable: boolean;
  warrantyRate: number | null;
  retailRate: number | null;
  unitPrice: number;
};

/** 409 body returned when a covered vehicle or open campaign was not acknowledged. */
export type AckRequiredError = { code: "WARRANTY_ACK_REQUIRED"; message: string; details: WarrantyCheck };
