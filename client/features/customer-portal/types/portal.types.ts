export type PortalBranch = {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
};

export type PortalProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  preferredContactMethod?: string | null;
  creditBalance?: number;
  branch?: PortalBranch | null;
  createdAt: string;
};

export type PortalProfileUpdate = {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  preferredContactMethod?: string;
};

export type PortalPasswordChange = {
  currentPassword: string;
  newPassword: string;
};

export type PortalVehicleBase = {
  id: string;
  vin?: string | null;
  registrationNumber?: string | null;
  make: string;
  model: string;
  year?: number | null;
  trim?: string | null;
  color?: string | null;
  warrantyStatus?: string | null;
  ownershipStatus?: string | null;
};

export type PortalVehicleImage = {
  id: string;
  url: string;
  type?: string | null;
};

export type PortalLatestJobCard = {
  id: string;
  jobNumber: string;
  status: string;
  progress?: number | null;
  description?: string | null;
  createdAt: string;
};

export type PortalVehicle = PortalVehicleBase & {
  images: PortalVehicleImage[];
  latestJobCard: PortalLatestJobCard | null;
  jobCardCount: number;
};

export type PortalVehicleJobCard = {
  id: string;
  jobNumber: string;
  status: string;
  progress?: number | null;
  description?: string | null;
  estimatedCost?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PortalVehicleDetail = PortalVehicleBase & {
  warrantyProvider?: string | null;
  warrantyExpiresAt?: string | null;
  images: PortalVehicleImage[];
  jobCards: PortalVehicleJobCard[];
};

export type PortalVehicleRef = {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  registrationNumber: string | null;
  color?: string | null;
  vin?: string | null;
};

export type PortalEstimate = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  approvals: {
    id: string;
    approved: boolean | null;
    decisionDate: string | null;
    comments: string | null;
    status: string;
  }[];
};

export type PortalJobCard = {
  id: string;
  jobNumber: string;
  description?: string | null;
  status: string;
  estimatedHours?: number | null;
  estimatedCost?: number | null;
  progress?: number | null;
  qcStatus?: string | null;
  assignedTo?: string | null;
  createdAt: string;
  updatedAt: string;
  vehicle: PortalVehicleRef | null;
  branch: { id: string; name: string } | null;
  technician: { id: string; firstName: string; lastName: string } | null;
  estimates: PortalEstimate[];
  invoices: {
    id: string;
    invoiceNumber: string;
    status: string;
    total: number;
    issuedDate: string;
  }[];
  inspections: {
    id: string;
    findings: string;
    status: string;
    passed: boolean | null;
  }[];
};

export type PortalJobCardFilter = {
  status?: string;
  vehicleId?: string;
};

export type PortalServiceItem = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  durationMins?: number | null;
  price: number;
};

export type PortalAppointment = {
  id: string;
  scheduledAt: string;
  durationMins?: number | null;
  status: string;
  notes?: string | null;
  service?: PortalServiceItem | null;
  vehicle: PortalVehicleRef | null;
  branch: { id: string; name: string } | null;
};

export type PortalPayment = {
  id: string;
  amount: number;
  method?: string | null;
  paymentDate?: string | null;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type PortalCreditApplication = {
  id: string;
  amount: number;
  status: string;
  comments?: string | null;
  decisionDate?: string | null;
  createdAt: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    total: number;
    status: string;
  } | null;
  requestedBy?: { id: string; firstName: string; lastName: string } | null;
};

export type PortalCreditTransaction = {
  id: string;
  amount: number;
  balanceAfter: number;
  type: string;
  description?: string | null;
  referenceId?: string | null;
  createdAt: string;
};

export type PortalCredit = {
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    branchId: string;
    creditBalance: number;
  };
  transactions: PortalCreditTransaction[];
};

export type PortalCreditDecisionPayload = {
  approved: boolean;
  comments?: string;
};

export type PortalInvoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  issuedDate: string;
  dueDate?: string | null;
  notes?: string | null;
  jobCard: {
    id: string;
    jobNumber: string;
    status?: string | null;
    vehicle: PortalVehicleRef | null;
  } | null;
  payments: PortalPayment[];
  creditApplications: PortalCreditApplication[];
};

export type PortalInvoiceDetail = PortalInvoice & {
  receipts?: {
    id: string;
    amount: number;
    reference?: string | null;
    issuedAt?: string | null;
  }[];
};

export type PortalVehicleRegistration = {
  vin: string;
  registrationNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  trim?: string;
  color?: string;
  warrantyStatus?: string;
  ownershipStatus?: string;
};

export type PortalAppointmentBooking = {
  vehicleId: string;
  serviceId: string;
  scheduledAt: string;
  durationMins?: number;
  notes?: string;
};

export type PortalDashboard = {
  vehicleCount: number;
  activeJobCount: number;
  completedJobCount: number;
  upcomingAppointments: number;
  outstandingTotal: number;
  creditBalance: number;
  pendingCreditCount: number;
  recentJobCards: PortalJobCard[];
  recentInvoices: PortalInvoice[];
};

export type EstimateApprovalPayload = {
  approved: boolean;
  comments?: string;
};

export type EstimateApprovalResult = {
  estimateId: string;
  jobCardId: string;
  status: string;
  decisionDate: string;
};
