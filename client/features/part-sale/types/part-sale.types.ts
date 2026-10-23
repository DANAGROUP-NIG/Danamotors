// Mirrors server/src/modules/part-sale (CPD customer purchase orders, counter sales, sale returns).

export type CustomerOrderStatus = "OPEN" | "PARTLY_BILLED" | "BILLED" | "CANCELLED";
export type TransportMode = "ROAD" | "AIR" | "SEA" | "COURIER" | "HAND_DELIVERY" | "DOOR_DELIVERY";

type UserRef = { id: string; firstName: string; lastName: string } | null;
type BranchRef = { id: string; name: string; code?: string | null };

export type SaleCustomer = {
  id: string;
  code: string | null;
  firstName: string;
  lastName: string;
  companyName: string | null;
  house: string | null;
  street: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phoneNumber: string | null;
  creditDays: number | null;
};

export type CustomerSearchResult = SaleCustomer & { name: string; outstanding: number };

export type SalePart = {
  id: string;
  partNumber: string;
  name: string;
  uom: string;
  binLocation: string | null;
  partFlag: string;
  taxable: boolean;
};

export type OrderLineCounts = {
  orderedQuantity: number;
  pickedQuantity: number;
  billedQuantity: number;
  cancelledQuantity: number;
};

export type CustomerOrderListItem = {
  id: string;
  cpoNumber: string;
  branchId: string;
  branch: BranchRef;
  customerId: string;
  customer: SaleCustomer;
  customerRefNo: string | null;
  orderDate: string;
  validTill: string | null;
  status: CustomerOrderStatus;
  totalQuantity: number;
  totalAmount: number;
  createdBy: UserRef;
  lines: OrderLineCounts[];
};

export type CustomerOrderLine = OrderLineCounts & {
  id: string;
  partId: string;
  part: SalePart;
  retailRate: number;
  amount: number;
  freeStock: number;
  invoiceLines: {
    quantity: number;
    invoice: { id: string; invoiceNumber: string; issuedDate: string; status: string; counterSale: { id: string } | null };
  }[];
};

export type CustomerOrder = Omit<CustomerOrderListItem, "lines"> & {
  customerRefDate: string | null;
  remarks: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelRemark: string | null;
  createdAt: string;
  lines: CustomerOrderLine[];
};

export type CreateOrderPayload = {
  branchId: string;
  customerId: string;
  customerRefNo?: string;
  customerRefDate?: string;
  validTill?: string;
  remarks?: string;
  pick?: boolean;
  lines: { partId: string; quantity: number }[];
};

export type SaleInvoiceLine = {
  id: string;
  partId: string | null;
  part: SalePart | null;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  vatPercent: number | null;
  returnedQuantity: number;
  customerOrderLine: { order: { id: string; cpoNumber: string; customerRefNo: string | null } } | null;
};

export type SaleReturn = {
  id: string;
  returnNumber: string;
  returnDate: string;
  reason: string | null;
  grossAmount: number;
  discountAmount: number;
  vatAmount: number;
  roundOff: number;
  total: number;
  createdBy: UserRef;
  creditNote: { id: string; number: string; remainingAmount: number } | null;
  lines: { id: string; invoiceLineId: string; quantity: number; rate: number; amount: number; part: SalePart }[];
};

export type CounterSale = {
  id: string;
  branchId: string;
  branch: BranchRef;
  salesExecutive: UserRef;
  transportMode: TransportMode | null;
  transporter: string | null;
  grNumber: string | null;
  grDate: string | null;
  numberOfCases: number | null;
  gatePassNumber: string | null;
  createdAt: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    issuedDate: string;
    dueDate: string | null;
    customer: SaleCustomer;
    partsTotal: number;
    partsDiscountPercent: number;
    partsDiscountAmount: number;
    vatRate: number;
    vatAmount: number;
    roundOff: number;
    total: number;
    outstandingAmount: number;
    status: string;
    notes: string | null;
    cancelledAt: string | null;
    cancelRemark: string | null;
    cancelledBy: UserRef;
    lines: SaleInvoiceLine[];
  };
  returns: SaleReturn[];
};

export type CounterSaleListItem = {
  id: string;
  branch: BranchRef;
  salesExecutive: UserRef;
  createdAt: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    issuedDate: string;
    total: number;
    outstandingAmount: number;
    status: string;
    customer: SaleCustomer;
    _count: { lines: number };
  };
  _count: { returns: number };
};

export type CreateCounterSalePayload = {
  branchId: string;
  customerId: string;
  cashDiscountPercent?: number;
  cashDiscountAmount?: number;
  transportMode?: TransportMode;
  transporter?: string;
  grNumber?: string;
  grDate?: string;
  numberOfCases?: number;
  notes?: string;
  lines: { orderLineId: string; quantity: number }[];
};

export type CreateReturnPayload = {
  reason?: string;
  lines: { invoiceLineId: string; quantity: number }[];
};

export type SaleReturnListItem = Omit<SaleReturn, "lines" | "creditNote"> & {
  customer: SaleCustomer;
  counterSale: { id: string; invoice: { invoiceNumber: string } };
  creditNote: { id: string; number: string } | null;
  _count: { lines: number };
};
