import type { Checklist, DamageType, FuelLevel } from "./job-check-in.types";
import type { JobCardStatus } from "./job-card-status";
import type { JobStage } from "./job-workspace.types";
import type {
  CampaignType,
  CampaignVehicleStatus,
  CaseStatus,
  Coverage,
  CoverageStatus,
} from "@/features/warranty/types/warranty.types";
export type { JobCardStatus } from "./job-card-status";

export type Inspection = {
  id: string;
  findings: string;
  passed: boolean;
  status: string;
  notes?: string;
};

export type Estimate = {
  upfrontPaymentPercent?: number | string;
  upfrontAmount?: number;
  version: number;
  estimateNumber?: string | null;
  estimateDate?: string | null;
  contentHash: string;

  id: string;
  description: string;
  amount: number;
  /** What the customer pays, with VAT: the approved lines once the customer has answered. */
  customerTotal: number;
  currency: string;
  status: string;
  createdAt?: string;
  approvals?: CustomerApproval[];
  lines?: {
    id: string;
    type: string;
    referenceId?: string | null;
    /** Part lines: part source code (internal; never shown to customers). */
    partSource?: string | null;
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }[];
};

export type CustomerApproval = {
  signatureState?: "valid" | "invalid" | "legacy" | "override" | "phone";
  channel?: "COUNTER" | "PHONE";
  signatureDueAtDelivery?: boolean;
  signature?: {
    imageReference: string;
    signerName: string;
    signedAt: string;
    estimateVersion: number;
    totalSigned: number;
    relationship?: string | null;
  } | null;

  id: string;
  estimateId: string;
  customerId: string;
  approved: boolean | null;
  decisionDate: string | null;
  comments: string | null;
  status: string;
};

export type JobCardAppointment = {
  id: string;
  scheduledAt: string;
  notes?: string;
  status: string;
};

export type JobCardBranch = {
  id: string;
  name: string;
};

export type JobCardCustomer = {
  id: string;
  type?: string | null;
  partyStatus?: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  companyName?: string | null;
  code?: string | null;
  phoneNumber?: string | null;
};

export type JobCardVehicle = {
  trim?: string | null;
  id: string;
  vin: string;
  registrationNumber: string | null;
  make: string;
  model: string;
  year: number;
  color: string;
};

export type PartIssuance = {
  requisitionLine?: { requisitionId: string; requisition: { status: string } } | null;
  receivedById?: string | null;
  receivedAt?: string | null;
  id: string;
  quantity: number;
  /** Part source code (internal; not shown to customers). */
  partSource?: string | null;
  notes?: string;
  issuedAt: string;
  sparePart: {
    id: string;
    partNumber: string;
    name: string;
    unitPrice: number;
    retailRate?: number | null;
  };
  issuedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  returns: PartReturn[];
};

export type PartReturn = {
  id: string;
  quantity: number;
  reason?: string;
  returnedAt: string;
  status: string;
};

export type JobCardInvoice = {
  outstandingAmount: number;
  id: string;
  invoiceNumber: string;
  issuedDate: string;
  dueDate?: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  notes?: string;
  payments: unknown[];
  receipts: unknown[];
};

export type JobCard = {
  openingSignatureRequired?: boolean;
  openingSignatureCurrent?: boolean;
  canStartWork?: boolean;
  advanceSummary?: {
    basis: "ESTIMATE" | "INVOICE";
    hasEstimate: boolean;
    total: number;
    receivedAmount: number;
    paidPercent: number | null;
    balanceAmount: number;
    excessAmount: number;
    suggestedPercent: number;
  };
  advanceReceipts?: {
    id: string;
    receiptNumber: string;
    amount: number;
    advanceAmount: number;
    status: string;
    mode: string;
    issuedAt: string;
  }[];
  allowedTransitions?: string[];
  depositReceiptId?: string | null;
  labourLines?: { id: string; description: string; hours: number; rate?: number; amount?: number; labourSlipId?: string | null; labourItem: { code?: string; description: string }; technician?: { firstName: string; lastName: string } | null; mechanic?: { name: string } | null }[];
  tyres?: { make: string; number: string }[] | null;
  batteryMake?: string | null;
  batteryNumber?: string | null;
  customField1?: string | null;
  remarks?: string | null;
  customerRemarks?: string | null;
  /** The check-in record (phase 2), without photos. Null until the advisor records it. */
  checkIn?: {
    fuelLevel: FuelLevel | null;
    checklist: Checklist;
    checklistNote: string | null;
    serviceBookSeen: boolean;
    serviceBookStamps: number | null;
    noValuables: boolean;
    belongingsNote: string | null;
    instructionsToTechnician: string | null;
    completedAt: string | null;
  } | null;
  /** x and y arrive as decimal strings (percentages of the diagram). */
  damageMarks?: { id: string; type: DamageType; x: number | string; y: number | string }[];
  /** Diagnosis (phase 3): the technician's findings and the service engineer's confirmation. */
  findings?: { id: string; complaintId: string | null; causeAndDefect: string; possibleWarranty: boolean }[];
  diagnosis?: {
    confirmedAt: string | null;
    route: "WARRANTY" | "ESTIMATE" | null;
    confirmedBy: { firstName: string; lastName: string } | null;
  } | null;
  serviceAdvisor?: { firstName: string; lastName: string } | null;
  deliveryAdvisor?: { firstName: string; lastName: string } | null;
  serviceCharge?: number | null;
  id: string;
  mileage?: number | null;
  inHouse?: boolean | null;
  acFitted?: boolean | null;
  promisedAt?: string | null;
  readyAt?: string | null;
  deliveredAt?: string | null;
  /** LATE_REASON master ids recorded at delivery or on the late-delivery entry screens. */
  lateReasonIds?: string[];
  /** Internal delay remark. */
  lateRemarks?: string | null;
  gatePassNumber?: string | null;
  serviceTypeId?: string | null;
  serviceType?: {
    description: string;
    code?: string;
    chargedTo?: string;
  } | null;
  bay?: { description: string } | null;
  team?: { description: string } | null;
  serviceAdvisorId?: string | null;
  creditApprovedById?: string | null;
  workDone?: string | null;
  previousJob?: {
    id: string;
    jobNumber: string;
    technician?: { firstName: string; lastName: string } | null;
  } | null;
  isRepeat?: boolean;
  repeatReason?: string | null;
  /** The repeat record (status of its review) when the job is, or was flagged as, a repeat. */
  repeatRecord?: { id: string; status: "PENDING_REVIEW" | "CONFIRMED" | "NOT_REPEAT"; source: "AUTOMATIC" | "MANUAL" } | null;
  complaints?: {
    id: string;
    description: string;
    complaintCodeId?: string | null;
    defectCode?: string | null;
  }[];
  statusHistory?: {
    id: string;
    fromStatus?: string;
    toStatus: string;
    createdAt: string;
    remarks?: string;
    actor: { firstName: string; lastName: string };
  }[];
  jobNumber: string;
  description: string;
  status: JobCardStatus;
  /** Step on the staged job card. */
  stage?: JobStage;
  estimatedHours: number;
  progress: number;
  qcStatus: string;
  qcNotes?: string;
  branchId: string;
  engineerId?: string;
  technicianId?: string;
  qualityInspectorId?: string;
  appointmentId?: string;
  customerId: string;
  vehicleId: string;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  technician?: { id: string; firstName: string; lastName: string } | null;
  qualityInspector?: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
  updatedAt: string;
  billedAt?: string | null;
  partsRequestedAt?: string | null;
  serviceId?: string | null;
  service?: {
    id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    durationMins?: number | null;
    price: number;
  } | null;
  appointment?: JobCardAppointment;
  branch: JobCardBranch;
  customer: JobCardCustomer;
  vehicle: JobCardVehicle;
  inspections: Inspection[];
  estimates: Estimate[];
  partIssuances?: PartIssuance[];
  invoices?: JobCardInvoice[];

  // Warranty snapshot taken at creation (never rewritten).
  warrantyStatusAtCreation?: CoverageStatus | null;
  warrantyReasonsAtCreation?: string[];
  warrantyExpiresOnAtCreation?: string | null;
  warrantyKmLimitAtCreation?: number | null;
  warrantySnapshot?: {
    coverage?: Coverage;
    reasonText?: string[];
    odometerReplaced?: boolean;
    odometerReplacedReason?: string | null;
    previousMileage?: number | null;
  } | null;
  warrantyAcknowledgedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  warrantyAcknowledgedAt?: string | null;
  completedAt?: string | null;
  warrantyCase?: { id: string; caseNumber: string; status: CaseStatus } | null;
  campaigns?: {
    campaignId: string;
    campaignCode: string;
    campaignTitle: string;
    campaignType: CampaignType;
    vehicleStatus: CampaignVehicleStatus | null;
    /** Was the campaign work done on this job? null = not answered yet (READY needs an answer). */
    attended: boolean | null;
    attendedAt: string | null;
    notAttendedReason: string | null;
    attendedBy: { id: string; firstName: string; lastName: string } | null;
    /** A FREE line is charged to this campaign, which pre-sets the answer to "done". */
    hasFreeLine: boolean;
    campaign: {
      status: "DRAFT" | "ACTIVE" | "CLOSED";
      jobCardText: string | null;
      printOnJobCard: boolean;
    };
  }[];
};

export type JobCardListResponse = {
  jobCards: JobCard[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
