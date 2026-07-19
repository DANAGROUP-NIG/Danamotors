export type AppointmentStatus =
  | "booked"
  | "checked_in"
  | "inspection"
  | "awaiting_approval"
  | "in_repair"
  | "quality_check"
  | "ready"
  | "completed"
  | "cancelled";

export type Appointment = {
  id: string;
  customerId: string;
  vehicleId: string;
  serviceType: string;
  status: AppointmentStatus;
  scheduledAt: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateAppointmentPayload = {
  customerId: string;
  vehicleId: string;
  serviceType: string;
  scheduledAt: string;
  notes?: string;
};

export type UpdateAppointmentPayload = Partial<CreateAppointmentPayload> & {
  status?: AppointmentStatus;
};

export type AppointmentListResponse = {
  items: Appointment[];
  total: number;
  page: number;
  pageSize: number;
};
