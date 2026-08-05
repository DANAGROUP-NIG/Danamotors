export type InvoiceCustomer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
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
  amount: number;
  issuedAt: string;
  reference?: string;
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
  status: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  customer: InvoiceCustomer;
  jobCard?: InvoiceJobCard;
  payments: InvoicePayment[];
  receipts: InvoiceReceipt[];
};

export type InvoiceListResponse = {
  invoices: Invoice[];
};
