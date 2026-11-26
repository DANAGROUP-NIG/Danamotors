/** Diagnosis (job card revamp phase 3), as returned by GET /service/job-cards/:id/diagnosis. */

export type DiagnosisSubStep = "ASSIGN_TECHNICIAN" | "FINDINGS" | "ENGINEER_REVIEW";
export type FindingItemKind = "LABOUR" | "PART" | "OIL";

export interface FindingItem {
  id?: string;
  kind: FindingItemKind;
  referenceId: string;
  description: string;
  /** Labour is always 1; parts and oil up to 2 decimal places. Never a price. */
  quantity: number;
}

export interface JobFinding {
  id: string;
  complaintId: string | null;
  causeAndDefect: string;
  possibleWarranty: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  items: FindingItem[];
  photos: { id: string; createdAt: string }[];
}

export interface CustomerRequest {
  id: string;
  number: number;
  description: string;
}

export interface DiagnosisRouting {
  coverageActive: boolean;
  openCampaigns: number;
  warrantyCase: boolean;
  flaggedFindings: number;
  route: "WARRANTY" | "ESTIMATE";
}

export interface JobDiagnosis {
  jobCardId: string;
  subStep: DiagnosisSubStep;
  editable: boolean;
  canAllocate: boolean;
  technician: { id: string; name: string | null } | null;
  bay: { id: string; code: string; description: string } | null;
  allocation: { note: string | null; by: string | null; at: string } | null;
  instructions: string | null;
  advisorName: string | null;
  requests: CustomerRequest[];
  findings: JobFinding[];
  returned: { note: string | null; by: string | null; at: string | null } | null;
  submitted: { by: string | null; at: string } | null;
  confirmed: { by: string | null; at: string; route: "WARRANTY" | "ESTIMATE" | null } | null;
  routing: DiagnosisRouting;
  gates: string[];
  engineers: string[];
}

/** What the findings autosave sends for one finding. */
export interface FindingInput {
  complaintId: string | null;
  causeAndDefect: string;
  possibleWarranty: boolean;
  items: { kind: FindingItemKind; referenceId: string; quantity: number }[];
  expectedVersion: number;
}

/** The editable part of a finding, kept on screen while it saves. */
export interface FindingDraft {
  causeAndDefect: string;
  possibleWarranty: boolean;
  items: FindingItem[];
}

/** A row of GET /workshop/technicians?activeOnly=true, with this phase's load fields. */
export interface TechnicianRow {
  id: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  jobsInHand: number;
  availability: "AVAILABLE" | "BUSY";
  employee: { team: { description: string } | null } | null;
}

export interface BayOption {
  id: string;
  code: string;
  description: string;
  occupiedBy: string | null;
}

export interface LabourOption {
  id: string;
  code: string;
  description: string;
}

export interface PartOption {
  id: string;
  partNumber: string;
  name: string;
  uom: string;
  kind: "PART" | "OIL";
}
