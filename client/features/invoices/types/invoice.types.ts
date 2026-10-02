export type InvoiceCustomer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  branchId?: string;
};

export type InvoiceJobCard = {
  id: string;
  jobNumber: string;
  description: string;
  branchId: string;
  branch: { id: string; name: string };
};

export type InvoicePayment = {
  id: string;
  amount: number;
  method: string;
  paymentDate: string;
  reference?: string;
};

export type InvoiceReceipt = {
  id: string;
  receiptNumber?: string;
  amount: number;
  issuedAt: string;
  reference?: string;
  mode?: string;
  status?: string;
};

export type InvoiceLine = {
  id: string;
  type: "PART" | "LABOUR";
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  customerPaid: boolean;
};

export type InvoiceReceiptAllocation = {
  id: string;
  amount: number;
  receipt: InvoiceReceipt;
};

export type Invoice = {
  id: string;
  customerId: string;
  jobCardId?: string;
  invoiceNumber: string;
  issuedDate: string;
  dueDate?: string;
  subtotal: number;
  tax: number;
  total: number;
  outstandingAmount: number;
  partsTotal: number;
  labourTotal: number;
  partsDiscountPercent: number;
  labourDiscountPercent: number;
  partsDiscountAmount: number;
  labourDiscountAmount: number;
  vatRate: number;
  vatAmount: number;
  roundOff: number;
  status: string;
  cancelledAt?: string | null;
  cancelRemark?: string | null;
  tallyVoucherNo?: string | null;
  tallyPostedAt?: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  customer: InvoiceCustomer;
  jobCard?: InvoiceJobCard;
  payments: InvoicePayment[];
  receipts: InvoiceReceipt[];
  allocations: InvoiceReceiptAllocation[];
  lines: InvoiceLine[];
  serviceAdvisor?: { id: string; firstName: string; lastName: string } | null;
};

export type InvoiceListResponse = {
  invoices: Invoice[];
};
