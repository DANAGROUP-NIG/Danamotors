// Shapes returned by the /pdi API (server/src/modules/pdi). Prisma decimals arrive as strings.
export type Money = number | string;

export type PdiStatus = "OPEN" | "IN_PROGRESS" | "WAITING_PARTS" | "QC" | "READY" | "BILLED" | "DELIVERED" | "CANCELLED";
export type ChargeType = "CUSTOMER" | "WARRANTY" | "FREE" | "GOODWILL";
export type PdiBillType = "CASH" | "INVOICE" | "ZERO";
export type PdiPrintKind = "job" | "requisition" | "return" | "labour" | "bill";

export interface Person { id: string; firstName: string; lastName: string }
export interface MasterRef { id: string; code: string; description: string }
export interface TyreEntry { makeId: string; make: string; number: string }
export interface Paged<T> { items: T[]; meta: { total: number; page: number; limit: number; totalPages: number } }

export interface PdiVehicle {
  id: string;
  vin: string;
  registrationNumber: string | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engineNumber: string | null;
  color: string | null;
  pdiDone: boolean;
  pdiDate: string | null;
  saleDate?: string | null;
  tyres: TyreEntry[] | null;
  batteryMake: string | null;
  batteryNumber: string | null;
  lastRecordedMileage?: number | null;
  catalogue: { id: string; code?: string; description: string; attributes?: { frontTyreSize?: string; rearTyreSize?: string } | null; parent?: { description: string } | null } | null;
  colour: MasterRef | null;
  customer?: { id: string; firstName: string; lastName: string; companyName: string | null } | null;
  pdiJobs?: { id: string; jobNumber: string; status: string; createdAt: string }[];
}

export interface PdiListItem {
  id: string;
  jobNumber: string;
  pdiRegistration: string | null;
  status: PdiStatus;
  createdAt: string;
  promisedAt: string | null;
  readyAt: string | null;
  billedAt: string | null;
  mileage: number | null;
  branch: { name: string };
  serviceType: MasterRef | null;
  engineer: Person | null;
  customerName: string | null;
  vehicle: { id: string; vin: string; model: string | null; trim: string | null; color: string | null; pdiDone: boolean; catalogue: { description: string } | null } | null;
  _count: { complaints: number; requisitions: number; labourSlips: number };
}

export interface PdiDefectLine {
  id: string;
  description: string;
  defectCode: string | null;
  spare: number;
  oil: number;
  labour: number;
  complaintCode: { id: string; code: string; description: string; parent: { description: string } | null } | null;
}

export interface DefectTotals { spare: number; oil: number; labour: number; total: number }
export interface ChargeTotals { warranty: number; nonWarranty: number; foc: number; goodwill: number; total: number }

export interface RequisitionLine {
  id: string;
  sparePartId: string;
  partNumber?: string;
  sparePart?: { partNumber: string };
  description: string;
  partSource: string;
  uom: string | null;
  location: string | null;
  quantityRequired: number;
  quantityIssued: number;
  rate: Money;
  amount: Money;
  approvalPercent: Money | null;
  customerPercent: Money | null;
  approvedAmount: Money;
  customerAmount: Money;
  returns: { quantity: number; status: string }[];
}

export interface RequisitionTotals { numberOfItems: number; netQuantityIssued: number; totalAmount: number; approvedAmount: number }

export interface PdiRequisition {
  id: string;
  requisitionNumber: string;
  requisitionDate: string;
  chargeType: ChargeType;
  status: string;
  pickingListNumber: string | null;
  mileage: number | null;
  printedAt: string | null;
  goodwillReason: string | null;
  cancelReason: string | null;
  engineer: Person | null;
  group: MasterRef | null;
  lines: RequisitionLine[];
  totals: RequisitionTotals;
  jobCard?: { id: string; jobNumber: string; pdiRegistration: string | null; vehicle: { vin: string; model: string | null } | null };
}

export interface PdiReturn {
  id: string;
  returnNumber: string;
  returnDate: string;
  status: string;
  printedAt: string | null;
  requisition: { requisitionNumber: string; chargeType?: ChargeType };
  lines?: { id: string; quantity: number; rate: Money | null; amount: Money | null; partIssuance: { sparePart: { partNumber: string; name: string } } }[];
  totals: { numberOfItems: number; netQuantityReturned: number; totalAmount: number };
  jobCard?: { id: string; jobNumber: string; pdiRegistration: string | null; vehicle: { vin: string; model: string | null } | null };
}

export interface LabourLine {
  id: string;
  description: string;
  standardHours: number | null;
  hours: number;
  rate: number;
  amount: number;
  labourItem: { code: string };
  technician: Person | null;
  group: MasterRef | null;
  chargeLine: { chargeType: ChargeType; amount: number } | null;
}

export interface PdiLabourSlip {
  id: string;
  slipNumber: string;
  slipDate: string;
  mileage: number | null;
  printedAt: string | null;
  engineer: Person | null;
  group: MasterRef | null;
  lines?: LabourLine[];
  lineCount?: number;
  totals: ChargeTotals;
  jobCard?: { id: string; jobNumber: string; pdiRegistration: string | null; status?: string; vehicle: { vin: string; model: string | null } | null };
}

export interface PdiInvoiceSummary {
  id: string;
  invoiceNumber: string;
  billType: string;
  pdiBillType: PdiBillType;
  status: string;
  total: number;
  issuedDate: string;
  cancelledAt: string | null;
  tallyVoucherNo: string | null;
  printedAt?: string | null;
  printTitle?: string;
}

export interface PdiJob {
  id: string;
  jobNumber: string;
  jobType: "PDI";
  pdiRegistration: string | null;
  status: PdiStatus;
  createdAt: string;
  promisedAt: string | null;
  readyAt: string | null;
  billedAt: string | null;
  mileage: number | null;
  remarks: string | null;
  workDone: string | null;
  printedAt: string | null;
  tyres: TyreEntry[] | null;
  batteryMake: string | null;
  batteryNumber: string | null;
  branchId: string;
  teamId: string | null;
  bayId: string | null;
  engineerId: string | null;
  technicianId: string | null;
  branch: { id: string; name: string };
  customer: { id: string; firstName: string; lastName: string; companyName: string | null; phoneNumber: string | null; address: string | null } | null;
  customerName: string | null;
  vehicle: PdiVehicle | null;
  serviceType: MasterRef | null;
  bay: MasterRef | null;
  team: MasterRef | null;
  engineer: Person | null;
  serviceAdvisor: Person | null;
  deliveryAdvisor: Person | null;
  technician: Person | null;
  complaints: PdiDefectLine[];
  defectTotals: DefectTotals;
  statusHistory: { id: string; fromStatus: string | null; toStatus: string; remarks: string | null; createdAt: string; actor: { firstName: string; lastName: string } }[];
  requisitions: PdiRequisition[];
  returnSlips: PdiReturn[];
  labourSlips: PdiLabourSlip[];
  invoices: PdiInvoiceSummary[];
  summary: { requisitions: number; partsIssuedAmount: number; returnsAmount: number; labour: ChargeTotals; billId: string | null };
  actions: { canEdit: boolean; canWork: boolean; canMarkWorkDone: boolean; canMarkReady: boolean; canBill: boolean; canCancel: boolean };
}

export interface PdiListResult extends Paged<PdiListItem> { statusCounts: Record<string, number> }

export interface DefectDraft { key: string; defectId: string; description: string; group?: string | null; spare: number; oil: number; labour: number }
export interface TyreDraft { makeId: string; number: string }

export interface PdiOpenPayload {
  branchId: string;
  vehicleId: string;
  customerId?: string;
  serviceTypeId: string;
  mileage: number;
  pdiRegistration?: string;
  bayId: string;
  serviceAdvisorId: string;
  engineerId: string;
  teamId?: string;
  technicianId?: string;
  promisedAt: string;
  remarks?: string;
  acType?: "FACTORY" | "DEALER" | "NONE";
  defects: { defectId?: string; description?: string; spare?: number; oil?: number; labour?: number }[];
  tyres?: { makeId?: string; number?: string }[];
  batteryMakeId?: string;
  batteryNumber?: string;
  acknowledgedCampaignIds?: string[];
}

export type PdiUpdatePayload = Partial<Pick<PdiOpenPayload, "pdiRegistration" | "mileage" | "bayId" | "engineerId" | "promisedAt" | "defects" | "tyres">> & {
  teamId?: string | null;
  technicianId?: string | null;
  remarks?: string | null;
  batteryMakeId?: string | null;
  batteryNumber?: string | null;
};

export interface PdiVehiclePayload { vin: string; catalogueId: string; colourId: string; engineNumber: string; acType?: "FACTORY" | "DEALER" | "NONE"; manufactureMonth?: number; manufactureYear?: number }

export interface RequisitionPayload {
  branchId: string;
  jobCardId: string;
  chargeType: ChargeType;
  engineerId?: string;
  groupId?: string;
  goodwillReason?: string;
  pickingListNumber?: string;
  mileage?: number;
  lines: { sparePartId: string; quantityRequired: number; quantityIssued: number; approvalPercent?: number; customerPercent?: number }[];
}

export interface ReturnPayload { requisitionId: string; lines: { requisitionLineId: string; quantity: number }[] }

export interface LabourLinePayload { labourItemId: string; chargeType: ChargeType; chargedHours?: number; technicianId?: string; groupId?: string; reason?: string }
export interface LabourSlipPayload { branchId: string; jobCardId: string; groupId?: string; engineerId?: string; mileage?: number; lines: LabourLinePayload[] }

export interface BillPreviewLine {
  type: "PART" | "LABOUR" | "SERVICE";
  chargeType: ChargeType;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  chargeable: boolean;
  partNumber: string | null;
  reference: string | null;
}

export interface BillTotals {
  partsTotal: number;
  labourTotal: number;
  serviceTotal: number;
  partsDiscountAmount: number;
  labourDiscountAmount: number;
  vatRate: number;
  vatAmount: number;
  roundOff: number;
  total: number;
}

export interface BillSplit { partsTotal: number; labourTotal: number; serviceTotal: number; chargeableTotal: number; nonChargeableTotal: number }

export interface PdiBillPreview {
  job: { id: string; jobNumber: string; pdiRegistration: string | null; createdAt: string; vehicle: PdiVehicle | null; customer: PdiJob["customer"]; engineer: Person | null; bay: MasterRef | null; serviceType: MasterRef | null; branch: { id: string; name: string } };
  lines: BillPreviewLine[];
  split: BillSplit;
  totals: BillTotals;
  suggestedBillType: PdiBillType;
}

export interface PdiBillPayload {
  jobCardId: string;
  billType: PdiBillType;
  deliveryAdvisorId: string;
  partsDiscountPercent: number;
  labourDiscountPercent: number;
  creditCompany?: string;
  cardNumber?: string;
  remarks?: string;
}

export interface PdiBill extends BillTotals {
  id: string;
  invoiceNumber: string;
  billType: string;
  pdiBillType: PdiBillType;
  printTitle: string;
  status: string;
  issuedDate: string;
  dueDate: string | null;
  subtotal: number;
  partsDiscountPercent: number;
  labourDiscountPercent: number;
  creditCompany: string | null;
  cardNumber: string | null;
  notes: string | null;
  cancelledAt: string | null;
  cancelRemark: string | null;
  printedAt: string | null;
  customer: { id: string; firstName: string; lastName: string; companyName: string | null; address: string | null; phoneNumber: string | null };
  serviceAdvisor: Person | null;
  voucher: { number: string | null; type: string; status: string; postedAt: string | null };
  job: { id: string; jobNumber: string; pdiRegistration: string | null; createdAt: string; mileage: number | null; vehicle: PdiVehicle | null; engineer: Person | null; bay: MasterRef | null; serviceType: MasterRef | null; branch: { id: string; name: string } };
  jobLines: BillPreviewLine[];
  /** Chargeable lines stored on the bill. */
  lines: { id: string; type: "PART" | "LABOUR" | "SERVICE"; description: string; quantity: number; rate: number; amount: number }[];
}

export interface PdiBillListItem {
  id: string;
  invoiceNumber: string;
  pdiBillType: PdiBillType;
  issuedDate: string;
  total: number;
  status: string;
  tallyVoucherNo: string | null;
  tallyPostedAt: string | null;
  cancelledAt: string | null;
  customer: { firstName: string; lastName: string; companyName: string | null };
  jobCard: { id: string; jobNumber: string; pdiRegistration: string | null; vehicle: { vin: string; model: string | null } | null };
}

export interface PdiSettings {
  jobFreezeDate: string | null;
  requisitionFreezeDate: string | null;
  returnFreezeDate: string | null;
  labourFreezeDate: string | null;
  billFreezeDate: string | null;
  jobEditBeforePrint: boolean;
  jobEditAfterPrint: boolean;
  requisitionEditBeforePrint: boolean;
  requisitionEditAfterPrint: boolean;
  returnEditBeforePrint: boolean;
  returnEditAfterPrint: boolean;
  labourEditBeforePrint: boolean;
  labourEditAfterPrint: boolean;
  billEditBeforePrint: boolean;
  billEditAfterPrint: boolean;
  roundBill: boolean;
  defaultCustomerId: string | null;
  defaultCustomer: { id: string; firstName: string; lastName: string; companyName: string | null } | null;
  includeInHistory: boolean;
  postBillsToTally: boolean;
  invoiceTitle: string;
  cashMemoTitle: string;
  updatedAt: string;
}

export type PdiSettingsPayload = Partial<Omit<PdiSettings, "defaultCustomer" | "updatedAt">>;

export interface PdiDefectOption { id: string; code: string; description: string; group: string | null; estimate: { partAmount: number; oilAmount: number; labourAmount: number } | null }
export interface ServiceTypeOption { id: string; code: string; description: string; chargedTo: string; serviceCharge: number }

export interface VehiclePdiJob {
  id: string;
  jobNumber: string;
  pdiRegistration: string | null;
  status: PdiStatus;
  createdAt: string;
  readyAt: string | null;
  billedAt: string | null;
  mileage: number | null;
  branch: { name: string };
  serviceType: MasterRef | null;
  engineer: Person | null;
  defectTotals: DefectTotals;
  complaints: { description: string }[];
  invoices: { invoiceNumber: string; billType: string; total: number; status: string }[];
}
