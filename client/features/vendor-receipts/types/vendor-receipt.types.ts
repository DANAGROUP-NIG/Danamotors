type Person = { id: string; firstName: string; lastName: string };
type BranchRef = { id: string; name: string; code?: string | null };

/** Legacy MRN tax forms, chosen per MRN. Only Z carries VAT (7.5% on taxable parts). */
export type MrnTaxForm = "P" | "Y" | "Z" | "X";

/** Vendors are parties (Customer rows) of type VENDOR. Their type (IMP / LOCAL) sets the default tax form. */
export type Vendor = {
  id: string;
  code: string | null;
  name: string;
  companyName: string | null;
  firstName: string;
  lastName: string;
  vendorType?: string | null;
  defaultTaxForm?: MrnTaxForm;
};

/** A part record to receive: a Mobis part or a source record (local, used, repaired…). */
export type ReceivablePart = {
  id: string;
  partNumber: string;
  name: string;
  uom: string;
  partFlag: string;
  sourceLabel: string;
  unitPrice: number;
  retailRate: number | null;
  sourceOfPart: { id: string; partNumber: string } | null;
  taxable: boolean;
  /** Branch-bought records (L/U/R) take the received cost as their dealer rate; Mobis records keep Finance's price. */
  repriced: boolean;
  /** Stock and bin at the receiving branch. */
  stock: number;
  bin: string | null;
};

export type VendorReceiptLine = {
  id: string;
  partId: string;
  receivedQuantity: number;
  /** Invoice price (invoice currency) and its naira cost at the MRN's conversion rate. */
  unitPrice: number;
  unitCost: number;
  amount: number;
  vatPercent: number;
  taxAmount: number;
  returnedQuantity: number;
  remarks: string | null;
  sourceLabel: string;
  bin: string | null;
  /** Stock now at the receiving branch. */
  stock: number;
  part: Pick<ReceivablePart, "id" | "partNumber" | "name" | "uom" | "partFlag" | "taxable" | "unitPrice" | "retailRate" | "sourceOfPart">;
};

export type VendorReceipt = {
  id: string;
  mrnNumber: string;
  vendor: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  receiptDate: string;
  remarks: string | null;
  taxForm: MrnTaxForm | null;
  conversionRate: number;
  duplicateReason: string | null;
  editedAt: string | null;
  totalReceived: number;
  totalValue: number;
  taxAmount: number;
  roundOff: number;
  netAmount: number;
  receivingBranchId: string;
  receivingBranch: BranchRef;
  receivedBy: Person | null;
  vendorParty: Omit<Vendor, "name"> | null;
  lines: VendorReceiptLine[];
  edits: { id: string; field: string; partNumber: string | null; oldValue: string | null; newValue: string | null; reason: string; createdAt: string; editedBy: Person | null }[];
  returns: { id: string; returnNumber: string; returnDate: string; totalQuantity: number; netAmount: number; fullReturn: boolean }[];
};

export type VendorReceiptListItem = Omit<VendorReceipt, "lines" | "vendorParty" | "edits" | "returns"> & { _count: { lines: number; returns: number } };

export type ReceiptLineInput = { partId: string; quantity: number; unitPrice: number };

export type CreateVendorReceiptPayload = {
  receivingBranchId: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxForm: MrnTaxForm;
  conversionRate?: number;
  duplicateReason?: string;
  remarks?: string;
  lines: ReceiptLineInput[];
};

export type EditVendorReceiptPayload = {
  reason: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  taxForm?: MrnTaxForm;
  conversionRate?: number;
  remarks?: string;
  lines?: ReceiptLineInput[];
};

export type CreateVendorReturnPayload = {
  vendorId?: string;
  fullReturn?: boolean;
  remarks?: string;
  lines?: { mrnLineId: string; quantity: number }[];
};

/** Parts sent back to a vendor against a vendor MRN (legacy MRN Return). */
export type VendorReturn = {
  id: string;
  returnNumber: string;
  returnDate: string;
  taxForm: MrnTaxForm | null;
  fullReturn: boolean;
  remarks: string | null;
  totalQuantity: number;
  totalValue: number;
  taxAmount: number;
  roundOff: number;
  netAmount: number;
  branchId: string;
  branch: BranchRef;
  vendorId: string;
  vendorName: string;
  createdBy: Person | null;
  mrn: { id: string; mrnNumber: string; receiptDate: string; invoiceNumber: string | null; invoiceDate?: string | null; vendor?: string | null; taxForm?: string | null };
  lines: {
    id: string;
    quantity: number;
    unitCost: number;
    amount: number;
    vatPercent: number;
    taxAmount: number;
    sourceLabel: string;
    part: { id: string; partNumber: string; name: string; uom: string; partFlag: string };
  }[];
};

export type VendorReturnListItem = Omit<VendorReturn, "lines"> & { _count: { lines: number } };
