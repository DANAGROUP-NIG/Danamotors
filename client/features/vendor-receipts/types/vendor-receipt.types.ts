type Person = { id: string; firstName: string; lastName: string };
type BranchRef = { id: string; name: string; code?: string | null };

/** Vendors are parties (Customer rows) of type VENDOR. */
export type Vendor = { id: string; code: string | null; name: string; companyName: string | null; firstName: string; lastName: string };

/** A part record to receive: a Mobis part or a source record (local, used, repaired…). */
export type ReceivablePart = {
  id: string;
  partNumber: string;
  name: string;
  uom: string;
  partFlag: string;
  sourceLabel: string;
  binLocation: string | null;
  unitPrice: number;
  retailRate: number | null;
  sourceOfPart: { id: string; partNumber: string } | null;
  /** Stock and bin at the receiving branch. */
  stock: number;
  bin: string | null;
};

export type VendorReceiptLine = {
  id: string;
  partId: string;
  receivedQuantity: number;
  unitCost: number;
  amount: number;
  remarks: string | null;
  sourceLabel: string;
  bin: string | null;
  part: Pick<ReceivablePart, "id" | "partNumber" | "name" | "uom" | "partFlag" | "binLocation" | "unitPrice" | "retailRate" | "sourceOfPart">;
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
  totalReceived: number;
  totalValue: number;
  receivingBranchId: string;
  receivingBranch: BranchRef;
  receivedBy: Person | null;
  vendorParty: Omit<Vendor, "name"> | null;
  lines: VendorReceiptLine[];
};

export type VendorReceiptListItem = Omit<VendorReceipt, "lines" | "vendorParty"> & { _count: { lines: number } };

export type CreateVendorReceiptPayload = {
  receivingBranchId: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  remarks?: string;
  lines: { partId: string; quantity: number; unitCost: number }[];
};
