export type HandheldDocumentType = "INDENT_PICK" | "CPO_PICK" | "MIT_RECEIVE" | "COUNT_SHEET";
/** QUEUED (waiting for a handheld) → SENT (on a handheld) → RECEIVED (finished, not posted) → UPLOADED (posted). */
export type HandheldDocumentStatus = "QUEUED" | "SENT" | "RECEIVED" | "UPLOADED" | "CANCELLED";
export type HandheldShortReason = "NOT_FOUND" | "DAMAGED" | "LESS_IN_BIN" | "OTHER";

interface PersonRef {
  firstName: string;
  lastName: string;
}

export interface HandheldDocumentLine {
  id: string;
  lineNumber: number;
  pickingListLineId: string | null;
  customerOrderLineId: string | null;
  mitLineId: string | null;
  partId: string | null;
  partNumber: string;
  partName: string | null;
  binLocation: string | null;
  caseNumber: string | null;
  expectedQuantity: number;
  extra: boolean;
  quantity: number | null;
  damagedQuantity: number;
  shortReason: HandheldShortReason | null;
  scannedPartNumber: string | null;
  note: string | null;
}

/** A received picking or MIT result, line by line, before it is posted. */
export interface DocumentReviewLine {
  lineId: string;
  lineNumber: number;
  partNumber: string;
  partName: string | null;
  binLocation: string | null;
  caseNumber: string | null;
  expectedQuantity: number;
  reported: boolean;
  quantity: number | null;
  damagedQuantity: number;
  shortReason: HandheldShortReason | null;
  scannedPartNumber: string | null;
  note: string | null;
}

export interface SheetReviewEntry {
  partId?: string;
  partNumber?: string;
  binLocation?: string;
  quantity: number;
  damagedQuantity?: number;
  remarks?: string;
  onSheet: boolean;
}

export interface HandheldReview {
  lines?: DocumentReviewLine[];
  extras?: { partNumber: string; quantity: number; damagedQuantity?: number; note?: string }[];
  entries?: SheetReviewEntry[];
  notCounted?: { partNumber: string; binLocation: string | null }[];
  totals: Record<string, number> | null;
  /** Why the result cannot be posted as it is (cancel it and send the job again). */
  problem: string | null;
}

export interface HandheldDocument {
  id: string;
  documentNumber: string;
  type: HandheldDocumentType;
  status: HandheldDocumentStatus;
  pickingListId: string | null;
  customerOrderId: string | null;
  mitId: string | null;
  stockTakeSheetId: string | null;
  branchId: string;
  branch: { id: string; name: string };
  pickerName: string;
  lineCount: number;
  queuedAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  uploadedAt: string | null;
  cancelledAt: string | null;
  cancelRemark: string | null;
  deviceKeptEntries: boolean;
  sentBy: PersonRef | null;
  uploadedBy: PersonRef | null;
  cancelledBy: PersonRef | null;
  deliveredDevice: { id: string; name: string } | null;
  deliveredStation: { id: string; name: string } | null;
  pickingList: { id: string; pickingNumber: string; status: string } | null;
  lines?: HandheldDocumentLine[];
  review?: HandheldReview | null;
}

export type HandheldSourceFilter = { sourceId: string } | { indentId: string } | { stockTakeId: string };

export interface HandheldPicker {
  id: string;
  code: string;
  name: string;
}

export interface StationState {
  branch: { id: string; name: string } | null;
  online: boolean;
  stations: { id: string; name: string; lastSeenAt: string | null; online: boolean; dockedDevice: { id: string; name: string } | null }[];
  docked: { id: string; name: string; dockedDevice: { id: string; name: string } | null }[];
}

/** What the page offers to send: the source (picking list, CPO, MIT or sheet) and its branch. */
export interface SendTarget {
  type: HandheldDocumentType;
  sourceId: string;
  branchId: string;
  label: string;
  /** Count sheets: the checker on the sheet now. */
  checkerId?: string | null;
}

/** A document ready to send to a handheld and not sent yet (GET /handheld/sources). */
export interface HandheldSource {
  sourceId: string;
  branchId: string;
  number: string;
  reference: string | null;
  date: string | null;
  party: string | null;
  lines: number;
  quantity: number;
  cases?: number;
  link: string;
}

export interface HandheldStation {
  id: string;
  name: string;
  branchId: string;
  branch: { id: string; name: string };
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  linkVersion: string | null;
  lastError: string | null;
  online: boolean;
  createdBy: PersonRef | null;
  dockedDevice: { id: string; name: string; appVersion: string | null; appStatus: string | null } | null;
}

export interface HandheldDevice {
  id: string;
  name: string;
  branchId: string;
  branch: { name: string };
  appVersion: string | null;
  appStatus: string | null;
  appError: string | null;
  lastSeenAt: string | null;
  lastStation: { name: string } | null;
}

export interface HandheldJobRow {
  id: string;
  type: HandheldDocumentType;
  status: HandheldDocumentStatus;
  documentNumber: string;
  pickerName: string;
  lineCount: number;
  queuedAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  branch: { name: string };
  deliveredDevice: { name: string } | null;
  deliveredStation: { name: string } | null;
  pickingList: { indent: { id: string; indentNumber: string } } | null;
  customerOrder: { id: string; cpoNumber: string } | null;
  mit: { id: string; mitNumber: string } | null;
  stockTakeSheet: { id: string; sheetNumber: string; stockTake: { id: string; type: string } } | null;
}

export interface HandheldOverview {
  stations: HandheldStation[];
  devices: HandheldDevice[];
  jobs: HandheldJobRow[];
  canManage: boolean;
}
