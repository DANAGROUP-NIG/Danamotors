import type { SaleCustomer } from "@/features/part-sale/types/part-sale.types";

type UserRef = { id: string; firstName: string; lastName: string } | null;
type BranchRef = {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phoneNumber?: string | null;
};
type PartRef = { id: string; partNumber: string; name: string; uom: string | null; partFlag: string | null };

export type ChallanLine = {
  id: string;
  partId: string;
  part: PartRef;
  quantity: number;
  returnedQuantity: number;
  rate: number;
  amount: number;
};

export type ChallanReturn = {
  id: string;
  returnNumber: string;
  returnDate: string;
  fullReturn: boolean;
  reason: string | null;
  totalQuantity: number;
  totalAmount: number;
  createdBy: UserRef;
  lines: { id: string; challanLineId: string; partId: string; part: PartRef; quantity: number; rate: number; amount: number }[];
};

export type Challan = {
  id: string;
  challanNumber: string;
  challanDate: string;
  gatePassNumber: string;
  remarks: string | null;
  totalQuantity: number;
  totalAmount: number;
  branchId: string;
  branch: BranchRef;
  customer: SaleCustomer;
  createdBy: UserRef;
  lines: ChallanLine[];
  returns: ChallanReturn[];
};

export type ChallanListItem = Omit<Challan, "lines" | "returns"> & {
  lineCount: number;
  returnedQuantity: number;
  parts: string[];
  firstPartName: string | null;
};

export type ChallanReturnListItem = Omit<ChallanReturn, "lines"> & {
  branch: BranchRef;
  challan: { id: string; challanNumber: string; challanDate: string; customer: SaleCustomer };
};

export type ChallanFilters = { search?: string; customerId?: string; from?: string; to?: string };

export type CreateChallanPayload = {
  branchId: string;
  customerId: string;
  remarks?: string;
  lines: { partId: string; quantity: number }[];
};

export type CreateChallanReturnPayload = {
  reason?: string;
  fullReturn?: boolean;
  lines?: { challanLineId: string; quantity: number }[];
};
