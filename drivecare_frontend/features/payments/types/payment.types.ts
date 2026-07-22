export type Payment = {
  id: string;
  invoiceId: string;
  recordedById: string;
  amount: number;
  method: string;
  paymentDate: string;
  reference?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    total: number;
    status: string;
    customerId: string;
    jobCardId: string;
    customer: {
      id: string;
      user: {
        email: string;
        firstName: string;
        lastName: string;
      };
    };
    jobCard: {
      id: string;
      jobNumber: string;
      branchId: string;
    };
  };
  recordedBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
};

export type PaymentListResponse = {
  payments: Payment[];
};
