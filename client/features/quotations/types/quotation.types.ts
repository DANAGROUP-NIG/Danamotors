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

export type EstimateLifecycle = "ACTIVE" | "PENDING_APPROVAL" | "CLOSED";
export type EstimateCloseReason = "CONVERTED" | "DECLINED" | "CANCELLED" | "SUPERSEDED";

export type Quotation = {
  id: string;
  /** Null for an estimate prepared before a job card exists. */
  jobCardId: string | null;
  estimateNumber?: string | null;
  estimateDate?: string | null;
  estimateStatus?: EstimateLifecycle;
  closedReason?: EstimateCloseReason | null;
  description: string;
  amount: number;
  discountAmount?: number;
  currency: string;
  /** Customer decision: Pending, Approved, Declined. */
  status: string;
  createdAt: string;
  updatedAt: string;
  branchId?: string | null;
  jobCard: EstimateJobCard | null;
  customer?: { id: string; firstName: string; lastName: string; companyName?: string | null } | null;
  vehicle?: EstimateJobCard["vehicle"] | null;
  branch?: { id: string; name: string } | null;
  openedJobCard?: { id: string; jobNumber: string } | null;
  approvals: EstimateApproval[];
};

export type PreJobEstimateLine = { type: "PART" | "LABOUR" | "SERVICE"; referenceId: string; quantity: number };

export type CreatePreJobEstimatePayload = {
  customerId: string;
  vehicleId: string;
  description: string;
  discountAmount?: number;
  lines: PreJobEstimateLine[];
  branchId?: string;
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
