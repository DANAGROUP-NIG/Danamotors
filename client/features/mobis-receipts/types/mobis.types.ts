export type ReceivedMode = "AIR" | "SEA" | "ROAD";
export type MitStatus = "IN_TRANSIT" | "VERIFIED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";

type PersonRef = { id: string; firstName: string; lastName: string };
type BranchRef = { id: string; name: string; code: string | null };

export type MobisMitLine = {
  id: string;
  partId: string;
  part: { id: string; partNumber: string; name: string; partStatus: "ACTIVE" | "BLOCKED"; unitPrice: number; uom: string };
  filePartNumber: string | null;
  filePartName: string | null;
  orderNumber: string | null;
  lineNumber: number | null;
  caseNumbers: string | null;
  intRef: string | null;
  weight: number | null;
  hsCode: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  newPart: boolean;
  receivedQuantity: number;
  damagedQuantity: number;
  shortQuantity: number;
};

export type Mrn = {
  id: string;
  mrnNumber: string;
  taxForm: string;
  conversionRate: number;
  receiptDate: string;
  remarks: string | null;
  totalReceived: number;
  totalDamaged: number;
  totalShort: number;
  totalValue: number;
  receivedBy: PersonRef | null;
};

export type MobisMit = {
  id: string;
  mitNumber: string;
  status: MitStatus;
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  conversionRate: number;
  receivedMode: ReceivedMode | null;
  physicalReceiptDate: string | null;
  sourceFileName: string | null;
  remarks: string | null;
  totalCases: number;
  totalQuantity: number;
  totalAmount: number;
  cancelledAt: string | null;
  createdAt: string;
  destinationBranchId: string;
  destinationBranch: BranchRef;
  createdBy: PersonRef | null;
  lines: MobisMitLine[];
  mrn: Mrn | null;
};

export type MobisMitListItem = Omit<MobisMit, "lines" | "mrn"> & {
  mrn: { id: string; mrnNumber: string; receiptDate: string; totalValue: number } | null;
  _count: { lines: number };
};

export type ImportMitPayload = {
  destinationBranchId: string;
  invoiceNumber: string;
  invoiceDate?: string;
  conversionRate: number;
  physicalReceiptDate?: string;
  receivedMode: ReceivedMode;
  remarks?: string;
  sourceFileName?: string;
  createMissingParts: boolean;
  lines: {
    orderNumber?: string;
    lineNumber?: string;
    partNumber: string;
    partName?: string;
    quantity: number;
    unitPrice: number;
    amount?: number;
    caseNumber?: string;
    intRef?: string;
    weight?: number;
    hsCode?: string;
  }[];
};

export type CreateMrnPayload = {
  taxForm?: string;
  receiptDate?: string;
  remarks?: string;
  lines?: { mitLineId: string; receivedQuantity: number; damagedQuantity?: number }[];
};

export type PartMatch = {
  partNumber: string;
  part: { id: string; partNumber: string; name: string; partStatus: "ACTIVE" | "BLOCKED"; unitPrice: number } | null;
};
