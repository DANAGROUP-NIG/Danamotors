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


  export type AppointmentSource = 'WalkIn' | 'OnlineBooking';

export type Appointment = {
  id: string;
  customerId: string;
  vehicleId: string;
  branchId: string;
  serviceId?: string | null;
  scheduledAt: string;
  durationMins?: number;
  notes?: string;
  source: AppointmentSource;
  status: AppointmentStatus;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  customer?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string | null;
  };
  vehicle?: Record<string, unknown>;
  branch?: { id: string; name: string };
  service?: {
    id: string;
    name: string;
    category?: string | null;
    description?: string | null;
    durationMins?: number | null;
    price: number;
  } | null;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  jobCards?: unknown[];
};

export type CreateAppointmentPayload = {
  customerId: string;
  vehicleId: string;
  branchName: string;
  serviceId: string;
  scheduledAt: string;
  durationMins?: number;
  notes?: string;
  createdById?: string;
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
