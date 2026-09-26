export type IndentStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "PICKING"
  | "PICKED"
  | "STN_CREATED"
  | "PACKED"
  | "DISPATCHED"
  | "IN_TRANSIT"
  | "SRN_CREATED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export type TransportMode = "ROAD" | "AIR" | "SEA" | "COURIER" | "HAND_DELIVERY";

export type PersonRef = { id: string; firstName: string; lastName: string };
export type BranchRef = { id: string; name: string };

export type PartRef = {
  id: string;
  partNumber: string;
  partCode: string;
  name: string;
  description?: string | null;
  uom: string;
  unitPrice: number;
  binLocation?: string | null;
  storeLocation?: string | null;
  role: "MAIN" | "ALTERNATE";
  mainPartId?: string | null;
  partStatus: "ACTIVE" | "BLOCKED";
};

export type LineSummary = {
  requested: number;
  approved: number | null;
  rejected: number;
  picked: number;
  backOrder: number;
  dispatched: number;
  received: number;
  damaged: number;
  short: number;
  inTransit: number;
  suppliedWithAlternate: boolean;
};

export type IndentLine = {
  id: string;
  lineNumber: number;
  partId: string;
  part: PartRef;
  partFlag?: string | null;
  urgentQuantity: number;
  stockQuantity: number;
  requestedQuantity: number;
  approvedQuantity: number | null;
  backOrderQuantity: number;
  unitRate: number;
  amount: number;
  currentStock: number | null;
  jobCardId?: string | null;
  jobCard?: { id: string; jobNumber: string } | null;
  jobNumber?: string | null;
  jobDate?: string | null;
  vin?: string | null;
  registrationNumber?: string | null;
  vehicleModel?: string | null;
  remarks?: string | null;
  summary: LineSummary;
};

export type StatusHistoryEntry = {
  id: string;
  fromStatus: IndentStatus | null;
  toStatus: IndentStatus;
  remarks: string | null;
  createdAt: string;
  actor: PersonRef | null;
};

export type ProgressStep = {
  key: string;
  label: string;
  completed: boolean;
  at: string | null;
  by: PersonRef | null;
  remarks: string | null;
};

export type PickingLine = {
  id: string;
  indentLineId: string;
  requestedPartId: string;
  requestedPart: PartRef;
  partId: string;
  part: PartRef;
  isAlternate: boolean;
  availableQuantity: number;
  pickedQuantity: number;
  binLocation?: string | null;
};

export type PickingList = {
  id: string;
  pickingNumber: string;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  completedAt?: string | null;
  completedBy?: PersonRef | null;
  lines: PickingLine[];
};

export type StnLine = {
  id: string;
  indentLineId: string;
  pickingLineId: string;
  requestedPartId: string;
  requestedPart: PartRef;
  partId: string;
  part: PartRef;
  isAlternate: boolean;
  quantity: number;
  unitRate: number;
  amount: number;
};

export type TransferCase = {
  id: string;
  caseNumber: string;
  status: "PACKED" | "DISPATCHED" | "RECEIVED";
  packerName?: string | null;
  weight?: number | null;
  totalQuantity: number;
  lines: { id: string; stnLineId: string; quantity: number }[];
};

export type PackingList = {
  id: string;
  packingNumber: string;
  status: "PACKED" | "DISPATCHED";
  dispatchMode?: TransportMode | null;
  waybillNumber?: string | null;
  courierName?: string | null;
  consignmentWeight?: number | null;
  packingDate: string;
  dispatchedAt?: string | null;
  remarks?: string | null;
};

export type MitLine = {
  id: string;
  stnLineId: string | null;
  partId: string;
  part: PartRef;
  requestedPartId?: string | null;
  caseNumbers?: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  receivedQuantity: number;
  damagedQuantity: number;
  shortQuantity: number;
};

export type Mit = {
  id: string;
  mitNumber: string;
  sourceType: "INTERNAL_TRANSFER" | "EXTERNAL_VENDOR";
  status: "IN_TRANSIT" | "VERIFIED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  dispatchMode?: TransportMode | null;
  waybillNumber?: string | null;
  transitDate: string;
  totalCases: number;
  totalQuantity: number;
  totalAmount: number;
  lines: MitLine[];
};

export type SrnLine = {
  id: string;
  mitLineId: string;
  partId: string;
  part: PartRef;
  receivedQuantity: number;
  damagedQuantity: number;
  shortQuantity: number;
  remarks?: string | null;
};

export type Srn = {
  id: string;
  srnNumber: string;
  receiptDate: string;
  remarks?: string | null;
  totalReceived: number;
  totalDamaged: number;
  totalShort: number;
  receivedBy?: PersonRef | null;
  lines: SrnLine[];
};

export type Stn = {
  id: string;
  stnNumber: string;
  status: "CREATED" | "DISPATCHED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  documentDate: string;
  taxForm?: string | null;
  transportMode?: TransportMode | null;
  remarks?: string | null;
  stockDeducted: boolean;
  totalQuantity: number;
  totalValue: number;
  dispatchedAt?: string | null;
  dispatchedBy?: PersonRef | null;
  lines: StnLine[];
  cases: TransferCase[];
  packingList: PackingList | null;
  mit: Mit | null;
  srns: Srn[];
};

export type Indent = {
  id: string;
  indentNumber: string;
  status: IndentStatus;
  orderDate: string;
  remarks?: string | null;
  authorisedBy?: string | null;
  authorisedAt?: string | null;
  requestingBranchId: string;
  requestingBranch: BranchRef;
  sourceBranchId: string;
  sourceBranch: BranchRef;
  requestedBy: PersonRef;
  approvedBy?: PersonRef | null;
  approvedAt?: string | null;
  approvalRemarks?: string | null;
  rejectedBy?: PersonRef | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  cancelledBy?: PersonRef | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lines: IndentLine[];
  statusHistory: StatusHistoryEntry[];
  progress: ProgressStep[];
  pickingList: PickingList | null;
  stn: Stn | null;
};

export type IndentListItem = {
  id: string;
  indentNumber: string;
  status: IndentStatus;
  orderDate: string;
  createdAt: string;
  requestingBranchId: string;
  sourceBranchId: string;
  requestingBranch: BranchRef;
  sourceBranch: BranchRef;
  requestedBy: PersonRef;
  stn: { id: string; stnNumber: string; status: Stn["status"] } | null;
  _count: { lines: number };
};

export type IndentListResponse = {
  items: IndentListItem[];
  total: number;
  page: number;
  limit: number;
};

export type PartSearchResult = PartRef & {
  unitRate: number;
  sourceAvailable: number;
  requestingStock: number;
};

export type PartLookup = {
  part: PartRef & { unitRate: number };
  requestingBranchStock: { quantity: number; reserved: number; available: number } | null;
  sourceBranchStock: { quantity: number; reserved: number; available: number } | null;
  alternates: {
    part: PartRef & { unitRate: number };
    sourceBranchStock: { quantity: number; reserved: number; available: number } | null;
  }[];
};

// ── Payloads ────────────────────────────────────────────────────────────────

export type CreateIndentPayload = {
  requestingBranchId: string;
  sourceBranchId: string;
  remarks?: string;
  authorisedBy?: string;
  submit?: boolean;
  lines: {
    partId: string;
    partFlag?: string;
    urgentQuantity?: number;
    stockQuantity?: number;
    jobCardId?: string;
    jobNumber?: string;
    vin?: string;
    registrationNumber?: string;
    vehicleModel?: string;
    remarks?: string;
  }[];
};

export type ApproveIndentPayload = {
  remarks?: string;
  lines?: { lineId: string; approvedQuantity?: number; supplyPartId?: string }[];
};

export type DispatchIndentPayload = {
  taxForm?: string;
  transportMode?: TransportMode;
  remarks?: string;
  waybillNumber?: string;
  courierName?: string;
  consignmentWeight?: number;
  packerName?: string;
  lines?: { pickingLineId: string; quantity: number }[];
  cases?: {
    packerName?: string;
    weight?: number;
    lines: { pickingLineId: string; quantity: number }[];
  }[];
};

export type ReceiveIndentPayload = {
  remarks?: string;
  closeShort?: boolean;
  lines?: { mitLineId: string; receivedQuantity: number; damagedQuantity?: number; remarks?: string }[];
};
