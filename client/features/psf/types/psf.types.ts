export type PsfStatus = "SATISFIED" | "DISSATISFIED" | "NO_PHONE" | "NOT_AVAILABLE" | "CLOSED";
export type PsfState = "toCall" | "dissatisfied" | "satisfied" | "closed" | "all";
export type PsfLineKind = "SERVICE" | "LABOUR";

export interface PsfListItem {
  id: string;
  jobNumber: string;
  deliveredAt: string;
  registration: string | null;
  model: string | null;
  serviceType: string | null;
  customer: string | null;
  phones: string | null;
  branchName: string;
  status: PsfStatus | null;
  callCount: number;
  lastCalledAt: string | null;
  lastCalledBy: string | null;
}

export interface PsfListResult {
  items: PsfListItem[];
  counts: Record<PsfState, number>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface PsfLine {
  key: string;
  kind: PsfLineKind;
  jobCardLabourId: string | null;
  code: string;
  description: string;
  major: boolean;
  status: PsfStatus | null;
}

export interface PsfCall {
  id: string;
  status: PsfStatus;
  remark: string | null;
  calledAt: string;
  calledBy: string | null;
  bookingAt: string | null;
  bookingServiceType: { code: string; description: string } | null;
  appointment: { id: string; bookingNumber: string | null; scheduledAt: string } | null;
  lines: { code: string; description: string; status: PsfStatus }[];
}

export interface PsfCustomer {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phones: { label: string; number: string }[];
  address: string | null;
  preferredFollowupDay: string | null;
  preferredFollowupTime: string | null;
  preferredContactMethod: string | null;
}

export interface PsfDetail {
  id: string;
  jobNumber: string;
  jobDate: string;
  branch: { id: string; name: string };
  deliveredAt: string;
  mileage: number | null;
  registration: string | null;
  vin: string | null;
  model: string | null;
  variant: string | null;
  serviceType: { code: string; description: string } | null;
  serviceAdvisor: string | null;
  deliveryAdvisor: string | null;
  customer: PsfCustomer | null;
  lines: PsfLine[];
  followUp: {
    status: PsfStatus;
    remark: string | null;
    callCount: number;
    lastCalledAt: string;
    lastCalledBy: string | null;
    closedAt: string | null;
    closedBy: string | null;
  } | null;
  calls: PsfCall[];
  blockedReason: string | null;
  activeBooking: { id: string; bookingNumber: string | null; scheduledAt: string } | null;
}

export interface PsfServiceType {
  id: string;
  code: string;
  description: string;
}

export interface PsfCallPayload {
  status: PsfStatus;
  remark: string | null;
  lines?: { key: string; status: PsfStatus }[];
  booking?: { scheduledAt: string; serviceTypeId: string | null; notes: string | null } | null;
}

export interface PsfCallResult {
  id: string;
  callId: string;
  status: PsfStatus;
  statusLabel: string;
  booking: { id: string; bookingNumber: string | null; linked: boolean } | null;
}
