import type { JobCardStatus } from "./job-card-status";
export type { JobCardStatus } from "./job-card-status";

export type Inspection = {
  id: string;
  findings: string;
  passed: boolean;
  status: string;
  notes?: string;
};

export type Estimate = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  approvals?: CustomerApproval[];
};

export type CustomerApproval = {
  id: string;
  estimateId: string;
  customerId: string;
  approved: boolean | null;
  decisionDate: string | null;
  comments: string | null;
  status: string;
};

export type JobCardAppointment = {
  id: string;
  scheduledAt: string;
  notes?: string;
  status: string;
};

export type JobCardBranch = {
  id: string;
  name: string;
};

export type JobCardCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

export type JobCardVehicle = {
  id: string;
  vin: string;
  registrationNumber: string | null;
  make: string;
  model: string;
  year: number;
  color: string;
};

export type PartIssuance = {
  id: string;
  quantity: number;
  notes?: string;
  issuedAt: string;
  sparePart: {
    id: string;
    partNumber: string;
    name: string;
    unitPrice: number;
  };
  issuedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  returns: PartReturn[];
};

export type PartReturn = {
  id: string;
  quantity: number;
  reason?: string;
  returnedAt: string;
  status: string;
};

export type JobCardInvoice = {
  id: string;
  invoiceNumber: string;
  issuedDate: string;
  dueDate?: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  notes?: string;
  payments: unknown[];
  receipts: unknown[];
};

export type JobCard = {
  labourLines?: { labourItem: { description: string } }[];
  tyres?: { make: string; number: string }[] | null;
  batteryMake?: string | null;
  batteryNumber?: string | null;
  customField1?: string | null;
  checklist?: string | null;
  remarks?: string | null;
  serviceAdvisor?: { firstName: string; lastName: string } | null;
  deliveryAdvisor?: { firstName: string; lastName: string } | null;
  estimatedParts?: number | null;
  estimatedOil?: number | null;
  estimatedLabour?: number | null;
  serviceCharge?: number | null;
  id: string;
  mileage?: number | null;
  promisedAt?: string | null;
  readyAt?: string | null;
  deliveredAt?: string | null;
  gatePassNumber?: string | null;
  serviceType?: { description: string } | null;
  bay?: { description: string } | null;
  team?: { description: string } | null;
  serviceAdvisorId?: string | null;
  creditApprovedById?: string | null;
  observations?: string | null;
  workDone?: string | null;
  previousJob?: { id: string; jobNumber: string; technician?: { firstName: string; lastName: string } | null } | null;
  isRepeat?: boolean;
  repeatReason?: string | null;
  complaints?: { id: string; description: string; defectCode?: string | null; spare?: number; oil?: number; labour?: number }[];
  statusHistory?: { id: string; fromStatus?: string; toStatus: string; createdAt: string; remarks?: string; actor: { firstName: string; lastName: string } }[];
  jobNumber: string;
  description: string;
  status: JobCardStatus;
  estimatedHours: number;
  estimatedCost: number;
  progress: number;
  qcStatus: string;
  qcNotes?: string;
  branchId: string;
  technicianId?: string;
  qualityInspectorId?: string;
  appointmentId?: string;
  customerId: string;
  vehicleId: string;
  assignedTo?: string;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  technician?: { id: string; firstName: string; lastName: string } | null;
  qualityInspector?: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
  updatedAt: string;
  billedAt?: string | null;
  serviceId?: string | null;
  service?: {
    id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    durationMins?: number | null;
    price: number;
  } | null;
  appointment?: JobCardAppointment;
  branch: JobCardBranch;
  customer: JobCardCustomer;
  vehicle: JobCardVehicle;
  inspections: Inspection[];
  estimates: Estimate[];
  partIssuances?: PartIssuance[];
  invoices?: JobCardInvoice[];
};

export type JobCardListResponse = {
  jobCards: JobCard[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
