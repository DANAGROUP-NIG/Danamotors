export type EstimateApproval = {
  id: string;
  estimateId: string;
  customerId: string;
  approved: boolean | null;
  decisionDate: string | null;
  comments: string | null;
  status: string;
};

export type EstimateJobCard = {
  id: string;
  jobNumber: string;
  branchId: string;
  branch: { id: string; name: string };
  customer: { id: string; firstName: string; lastName: string };
  vehicle: {
    id: string;
    make: string | null;
    model: string | null;
    registrationNumber: string | null;
    vin: string;
  };
};

export type Quotation = {
  id: string;
  jobCardId: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  jobCard: EstimateJobCard;
  approvals: EstimateApproval[];
};

export type QuotationListResponse = {
  estimates: Quotation[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
