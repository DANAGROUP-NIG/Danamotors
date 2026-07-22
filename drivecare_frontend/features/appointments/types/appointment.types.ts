export type AppointmentStatus =
  | "Pending"
  | "Checked In"
  | "Inspection"
  | "Awaiting Approval"
  | "In Repair"
  | "Quality Check"
  | "Ready"
  | "Completed"
  | "Cancelled";

export type Appointment = {
  id: string;
  customerId: string;
  vehicleId: string;
  branchId: string;
  scheduledAt: string;
  durationMins?: number;
  notes?: string;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
  customer?: {
    id: string;
    user: { email: string; firstName: string; lastName: string };
  };
  vehicle?: Record<string, unknown>;
  branch?: { id: string; name: string };
  jobCards?: unknown[];
};

export type CreateAppointmentPayload = {
  customerId: string;
  vehicleId: string;
  branchName: string;
  scheduledAt: string;
  durationMins?: number;
  notes?: string;
};

export type UpdateAppointmentPayload = {
  scheduledAt?: string;
  durationMins?: number;
  notes?: string;
  status?: AppointmentStatus;
};

export type AppointmentListResponse = {
  appointments: Appointment[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
