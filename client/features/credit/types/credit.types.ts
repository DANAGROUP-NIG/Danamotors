export type CreditTransaction = {
  id: string;
  amount: number;
  balanceAfter: number;
  type: string;
  description?: string | null;
  referenceId?: string | null;
  createdAt: string;
  recordedBy?: { id: string; firstName: string; lastName: string } | null;
};

export type CustomerCredit = {
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    branchId: string;
    creditBalance: number;
  };
  transactions: CreditTransaction[];
};

export type CreditApplicationCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  branchId: string;
};

export type CreditApplicationInvoice = {
  id: string;
  invoiceNumber: string;
  total: number;
  status: string;
};

export type CreditApplication = {
  id: string;
  amount: number;
  status: string;
  comments?: string | null;
  decisionDate?: string | null;
  createdAt: string;
  customer: CreditApplicationCustomer;
  invoice: CreditApplicationInvoice;
  requestedBy: { id: string; firstName: string; lastName: string };
};

export type AdjustCreditPayload = {
  amount: number;
  description?: string;
};

export type CreateCreditApplicationPayload = {
  customerId: string;
  invoiceId: string;
  amount: number;
  comments?: string;
};
