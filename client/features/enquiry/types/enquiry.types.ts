export type EnquiryStatus = 'open' | 'in_progress' | 'approved' | 'rejected';

export type Enquiry = {
  id:                 string;
  firstName:          string;
  lastName:           string;
  email:              string;
  phoneNumber:        string;
  vehicleMake?:       string | null;
  vehicleModel?:      string | null;
  vehicleYear?:       number | null;
  vehicleRegNumber?:  string | null;
  serviceDescription: string;
  preferredDate?:     string | null;
  status:             EnquiryStatus;
  reviewNotes?:       string | null;
  reviewedAt?:        string | null;
  createdAt:          string;
  updatedAt:          string;
  branch:             { id: string; name: string };
  reviewedBy?:        { id: string; firstName: string; lastName: string } | null;
  appointment?:       { id: string; status: string; scheduledAt: string } | null;
};

export type EnquiryListResponse = {
  enquiries: Enquiry[];
  meta: {
    total:      number;
    page:       number;
    limit:      number;
    totalPages: number;
  };
};

export type ReviewEnquiryPayload = {
  action:       'approve' | 'reject';
  reviewNotes?: string;
  // approve-only
  customerId?:   string;
  vehicleId?:    string;
  scheduledAt?:  string;
  serviceId?:    string;
  durationMins?: number;
  notes?:        string;
};

export type ReviewEnquiryResponse = {
  enquiry:     Enquiry;
  appointment: import('@/features/appointments/types/appointment.types').Appointment | null;
};