export type CscStage = "FIRST" | "SECOND" | "NOT_VISITED";
export type CscState = "DUE" | "DONE" | "BOTH";
export type CscCaseStatus = "OPEN" | "VISITED" | "CLOSED";
export type CscClosureType = "FINAL" | "PARTIAL";
export type VisitTiming = "EARLY" | "ON_TIME" | "LATE";

export interface CscModelSummary {
  id: string;
  code: string;
  description: string;
  active: boolean;
  versions: { effectiveDate: string; services: number }[];
}

export interface CscServiceType {
  id: string;
  code: string;
  description: string;
}

export interface CscRuleValues {
  dueDays: number;
  dueKm: number;
  rotationDays: number;
  rotationKm: number;
  followUp1Days: number;
  followUp2Days: number;
  variationDays: number;
  variationKm: number;
}

export interface CscRuleRow extends CscRuleValues {
  id: string;
  serviceTypeId: string;
  serviceType: CscServiceType;
  active: boolean;
}

export interface CscVersion {
  effectiveDate: string;
  notVisitedMonths: number;
  matchDaysBefore: number;
  matchDaysAfter: number;
  services: CscRuleRow[];
}

export interface CscModelRules {
  model: { id: string; code: string; description: string; active: boolean };
  versions: CscVersion[];
}

export interface SaveRulesPayload {
  modelIds: string[];
  effectiveDate: string;
  notVisitedMonths: number;
  matchDaysBefore: number;
  matchDaysAfter: number;
  services: (CscRuleValues & { serviceTypeId: string; active: boolean })[];
}

export interface CscReason {
  id: string;
  code: string;
  description: string;
  shortDescription: string | null;
  closureType: CscClosureType;
  active: boolean;
  used: number;
}

export interface ReasonPayload {
  code?: string;
  description: string;
  shortDescription: string | null;
  closureType: CscClosureType;
  active: boolean;
}

export interface GeneratePayload {
  from: string;
  to: string;
  modelIds?: string[];
  serviceTypeIds?: string[];
  branchId?: string;
}

export interface GenerateResult {
  from: string;
  to: string;
  vehiclesChecked: number;
  due: number;
  created: number;
  alreadyGenerated: number;
  alreadyVisited: number;
  byService: { code: string; description: string; due: number }[];
  skipped: { noStartDate: number; notVisitedRecently: number; noSchedule: number };
}

export interface CscVehicle {
  id: string;
  registration: string | null;
  vin: string;
  model: string | null;
  variant: string | null;
  lastRecordedMileage: number | null;
  saleDate: string | null;
}

export interface CscReasonRef {
  id: string;
  code: string;
  description: string;
  closureType: CscClosureType;
}

export interface CscListItem {
  id: string;
  status: CscCaseStatus;
  dueDate: string;
  dueMileage: number | null;
  followUp1Date: string;
  followUp2Date: string;
  service: CscServiceType;
  vehicle: CscVehicle;
  customer: { id: string; name: string | null; phone: string | null } | null;
  stageDone: boolean;
  firstDone: boolean;
  secondDone: boolean;
  stageContacts: number;
  lastContactDate: string | null;
  stageClosure: string | null;
  booked: boolean;
  bookedFor: string | null;
  closeReason: CscReasonRef | null;
  visitJobNumber: string | null;
  daysOverdue: number;
  notVisited: boolean;
}

export interface CscListResult {
  items: CscListItem[];
  stateCounts: Record<CscState, number>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CscContact {
  id: string;
  slot: number;
  contactDate: string;
  contactPerson: string | null;
  remarks: string | null;
  doneBy: { id: string; name: string | null } | null;
}

export interface CscStageClosure {
  reason: CscReasonRef;
  remarks: string | null;
  closedAt: string;
  closedBy: string | null;
}

export interface CscCaseDetail extends Omit<CscListItem, "customer"> {
  matchDaysBefore: number;
  matchDaysAfter: number;
  generatedAt: string;
  branch: { id: string; name: string };
  customer: {
    id: string;
    name: string | null;
    firstName: string;
    lastName: string;
    companyName: string | null;
    phoneNumber: string | null;
    mobile2: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    contactPerson: string | null;
    preferredFollowupDay: string | null;
    preferredFollowupTime: string | null;
    preferredContactMethod: string | null;
  } | null;
  lastVisit: { id: string; jobNumber: string; date: string; mileage: number | null; status: string; serviceType: { code: string; description: string } | null } | null;
  visit: { id: string; jobNumber: string; date: string; mileage: number | null; timing: VisitTiming } | null;
  booking: { id: string; bookingNumber: string | null; scheduledAt: string; status: string; bookingStatus: string } | null;
  bookedAt: string | null;
  closure: CscStageClosure | null;
  stages: Record<CscStage, { contacts: CscContact[]; closure: CscStageClosure | null }>;
  canEdit: boolean;
}

export interface ContactDraft {
  slot: number;
  contactDate: string;
  contactPerson: string;
  remarks: string;
  doneById: string;
}

export interface FollowUpPayload {
  stage: CscStage;
  contacts: { slot: number; contactDate: string; contactPerson: string | null; remarks: string | null; doneById: string | null }[];
  booking: { scheduledAt: string; notes: string | null } | null;
  closure: { reasonId: string; remarks: string | null } | null;
}

export interface FollowUpResult {
  id: string;
  stage: CscStage;
  status: CscCaseStatus;
  booking: { id: string; bookingNumber: string | null; linked: boolean } | null;
  closure: { code: string; closureType: CscClosureType } | null;
}

export interface CscSummary {
  open: number;
  firstDue: number;
  secondDue: number;
  notVisited: number;
  booked: number;
  visitedThisMonth: number;
  closedThisMonth: number;
}

export interface CscStaff {
  id: string;
  name: string | null;
  role: string;
}

export interface CaseListParams {
  stage: CscStage;
  state: CscState;
  from: string;
  to: string;
  includeFirstNotDone?: boolean;
  daysNotVisited?: number;
  onlyFollowedUp?: boolean;
  modelId?: string[];
  serviceTypeId?: string[];
  search?: string;
  page: number;
  limit: number;
}
