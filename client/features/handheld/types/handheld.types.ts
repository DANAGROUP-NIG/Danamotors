export type HandheldDocumentType = "INDENT_PICK" | "CPO_PICK" | "MIT_RECEIVE";
export type HandheldDocumentStatus = "SENT" | "UPLOADED" | "CANCELLED";
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

export interface HandheldDocument {
  id: string;
  documentNumber: string;
  type: HandheldDocumentType;
  status: HandheldDocumentStatus;
  pickingListId: string | null;
  customerOrderId: string | null;
  mitId: string | null;
  branchId: string;
  pickerName: string;
  lineCount: number;
  sentAt: string;
  uploadedAt: string | null;
  cancelledAt: string | null;
  cancelRemark: string | null;
  sentBy: PersonRef | null;
  uploadedBy: PersonRef | null;
  cancelledBy: PersonRef | null;
  pickingList: { id: string; pickingNumber: string; status: string } | null;
  lines?: HandheldDocumentLine[];
}

export type HandheldSourceFilter = { sourceId: string } | { indentId: string };
