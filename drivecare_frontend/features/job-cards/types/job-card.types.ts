export type JobCardStatus = "pending" | "in_progress" | "completed" | "on_hold" | "cancelled";

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
  make: string;
  model: string;
  year: number;
  color: string;
};

export type JobCard = {
  id: string;
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
  createdAt: string;
  updatedAt: string;
  appointment?: JobCardAppointment;
  branch: JobCardBranch;
  customer: JobCardCustomer;
  vehicle: JobCardVehicle;
  inspections: Inspection[];
  estimates: Estimate[];
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
