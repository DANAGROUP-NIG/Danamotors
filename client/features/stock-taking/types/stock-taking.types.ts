// Mirrors server/src/modules/stock-take (physical stock taking and stock audit).

export type StockTakeType = "ANNUAL" | "PERPETUAL" | "AUDIT";
/** Physical counts (annual, perpetual) or stock audits. */
export type Kind = "COUNT" | "AUDIT";
export type StockAuditLevel = "INTERNAL" | "AUDIT_HEAD" | "VISITING_MANAGEMENT";
export type StockTakeStatus = "ACTIVE" | "COMPLETED" | "CONFIRMED" | "CANCELLED";
export type Basis = "PART" | "BIN";
export type LineFilter = "ALL" | "UNCOUNTED" | "DISCREPANCY" | "DAMAGED" | "UNKNOWN";

type UserRef = { id: string; firstName: string; lastName: string } | null;
type BranchRef = { id: string; name: string; code?: string | null };

export type PartSelection = {
  basis?: Basis;
  from?: string;
  to?: string;
  partFlag?: string;
  category?: string;
  priceCategoryCode?: string;
  dealerRateFrom?: number;
  dealerRateTo?: number;
  onlyWithStock?: boolean;
  topConsumed?: { count: number; months: number; includeStn?: boolean };
};

export type CandidatePart = {
  partId: string;
  partNumber: string;
  name: string;
  partFlag: string;
  bin: string;
  dealerRate: number;
  stock: number;
  /** Batch number of another open count holding this part. */
  openBatch: string | null;
};

export type StockTakeSummary = {
  lines: number;
  counted: number;
  uncounted: number;
  onOpenSheets: number;
  unknown: number;
  systemQuantity: number;
  physicalQuantity: number;
  damagedQuantity: number;
  discrepancies: number;
  excessQuantity: number;
  excessValue: number;
  shortageQuantity: number;
  shortageValue: number;
};

export type CountSheet = {
  id: string;
  sheetNumber: string;
  checker: UserRef;
  criteria: string | null;
  showSystemStock: boolean;
  lineCount: number;
  countedCount: number | null;
  issuedAt: string;
  issuedBy: UserRef;
  uploadedAt: string | null;
  uploadedBy: UserRef;
  cancelledAt: string | null;
  cancelRemark: string | null;
};

export type StockTakeListItem = {
  id: string;
  batchNumber: string;
  type: StockTakeType;
  status: StockTakeStatus;
  remarks: string | null;
  auditLevel: StockAuditLevel | null;
  auditors: string | null;
  createdAt: string;
  branch: BranchRef;
  createdBy: UserRef;
  countedLines: number;
  _count: { lines: number };
};

export type StockTake = {
  id: string;
  batchNumber: string;
  branchId: string;
  branch: BranchRef;
  type: StockTakeType;
  status: StockTakeStatus;
  remarks: string | null;
  auditLevel: StockAuditLevel | null;
  auditors: string | null;
  createdAt: string;
  createdBy: UserRef;
  completedAt: string | null;
  completedBy: UserRef;
  confirmedAt: string | null;
  confirmedBy: UserRef;
  binsUpdatedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: UserRef;
  cancelRemark: string | null;
  sheets: CountSheet[];
  summary: StockTakeSummary;
};

type LinePart = { id: string; partNumber: string; name: string; partFlag: string; uom: string; unitPrice: number };

export type StockTakeLine = {
  id: string;
  partId: string | null;
  partNumber: string;
  part: LinePart | null;
  binLocation: string | null;
  systemStock: number;
  addedDuringCount: boolean;
  countedQuantity: number | null;
  damagedQuantity: number;
  countedBins: string | null;
  remarks: string | null;
  countedAt: string | null;
  stockAtCount: number | null;
  notRequired: boolean;
  adjustedQuantity: number | null;
  discrepancy: number | null;
  rate: number;
  sheet: { id: string; sheetNumber: string; uploadedAt: string | null; cancelledAt: string | null; checker: UserRef } | null;
};

export type LinePage = { lines: StockTakeLine[]; total: number; page: number; pageSize: number };

export type SheetDetail = CountSheet & {
  stockTake: { id: string; batchNumber: string; type: StockTakeType; status: StockTakeStatus; branchId: string; branch: BranchRef };
  lines: (Omit<StockTakeLine, "discrepancy" | "rate" | "sheet">)[];
};

export type Movement = {
  id: string;
  createdAt: string;
  type: string;
  quantity: number;
  referenceId: string | null;
  notes: string | null;
  partNumber: string;
  name: string;
  by: string | null;
};

export type BinProposal = {
  lineId: string;
  partId: string;
  partNumber: string;
  name: string;
  partFlag: string;
  currentBin: string | null;
  countedBins: string;
};

export type Checker = { id: string; firstName: string; lastName: string };

// ── Payloads ────────────────────────────────────────────────────────────────

export type CreateStockTakePayload = {
  branchId: string;
  type: StockTakeType;
  remarks?: string;
  auditLevel?: StockAuditLevel;
  auditors?: string;
  selection: PartSelection;
  excludePartIds?: string[];
};

export type CreateSheetPayload = {
  checkerId?: string;
  basis?: Basis;
  from?: string;
  to?: string;
  lineIds?: string[];
  uncountedOnly?: boolean;
  showSystemStock?: boolean;
};

export type CountEntry = {
  partId?: string;
  partNumber?: string;
  binLocation?: string;
  quantity: number;
  damagedQuantity?: number;
  remarks?: string;
};
