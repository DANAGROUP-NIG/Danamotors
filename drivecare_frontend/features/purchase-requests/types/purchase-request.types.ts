export type PurchaseRequestStatus = "Pending" | "Approved" | "Rejected";

export type PurchaseRequest = {
  id: string;
  sparePartId: string;
  sparePart: {
    id: string;
    partNumber: string;
    name: string;
    unitPrice: number;
  };
  requestedById: string;
  requestedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  quantity: number;
  status: PurchaseRequestStatus;
  requestDate: string;
  approvalNotes?: string;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseRequestListResponse = {
  purchaseRequests: PurchaseRequest[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
