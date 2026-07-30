export type TransferStatus =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Dispatched"
  | "Received"
  | "Cancelled";

export type TransferItem = {
  id: string;
  partId: string;
  part: {
    id: string;
    partNumber: string;
    name: string;
    unitPrice: number;
  };
  requestedQuantity: number;
  dispatchedQuantity?: number | null;
  receivedQuantity?: number | null;
};

export type Transfer = {
  id: string;
  transferNumber: string;
  requestingBranchId: string;
  requestingBranch: { id: string; name: string };
  sourceBranchId: string;
  sourceBranch: { id: string; name: string };
  requestedById: string;
  requestedBy: { id: string; firstName: string; lastName: string };
  approvedById?: string | null;
  approvedBy?: { id: string; firstName: string; lastName: string } | null;
  dispatchedById?: string | null;
  dispatchedBy?: { id: string; firstName: string; lastName: string } | null;
  receivedById?: string | null;
  receivedBy?: { id: string; firstName: string; lastName: string } | null;
  status: TransferStatus;
  notes?: string | null;
  approvedAt?: string | null;
  dispatchedAt?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items: TransferItem[];
};

export type TransferListResponse = {
  transfers: Transfer[];
};
