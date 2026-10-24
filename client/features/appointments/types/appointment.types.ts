export type BookingRequest = { complaintCodeId?: string; defectCode?: string; description: string; spare?: number; oil?: number; labour?: number };
export type BookingExtra = { mileage?: number; acFitted?: boolean; followUpJobId?: string | null; requests?: BookingRequest[] };
export type AppointmentStatus =
  | "Pending"
  | "Checked In"
  | "Inspection"
  | "Awaiting Approval"
  | "In Repair"
  | "Quality Check"
  | "Ready"
  | "Completed"
  | "Cancelled"
  | "No Show";


  export type AppointmentSource = 'WalkIn' | 'OnlineBooking';

export type Appointment = {
  bookingNumber?: string | null;
  bookingStatus?: 'BOOKED' | 'CONVERTED' | 'CANCELLED' | 'NO_SHOW';
  serviceTypeId?: string | null;
  mileage?: number | null;
  acFitted?: boolean | null;
  followUpJobId?: string | null;
  cancelReason?: string | null;
  requests?: { id: string; complaintCodeId: string | null; defectCode: string | null; description: string; estimatedParts: string | number; estimatedOil: string | number; estimatedLabour: string | number }[];
  totals?: { estimatedParts: number; estimatedOil: number; estimatedLabour: number; estimatedTotal: number };
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

export type CreateAppointmentPayload = BookingExtra & {
  customerId: string;
  vehicleId: string;
  branchName: string;
  serviceId?: string;
  serviceTypeId?: string;
  scheduledAt: string;
  durationMins?: number;
  notes?: string;
  createdById?: string;
};

export type UpdateAppointmentPayload = BookingExtra & {
  serviceId?: string;
  serviceTypeId?: string;
  bookingStatus?: "BOOKED" | "CANCELLED" | "NO_SHOW";
  cancelReason?: string;
  scheduledAt?: string;
  durationMins?: number;
  notes?: string;
  status?: AppointmentStatus;
  /** Odometer reading taken at check-in; runs the warranty & campaign check. */
  mileage?: number;
  warrantyAcknowledged?: boolean;
  acknowledgedCampaignIds?: string[];
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
