import type { EstimatePayer } from "./job-estimate.types";
import type { JobStage } from "./job-workspace.types";

/** Repair (job card revamp phase 6). Matches GET /service/job-cards/:id/repair. No prices. */
export type WorkLineStatus = "NOT_STARTED" | "IN_PROGRESS" | "WAITING_PARTS" | "DONE";
export type WorkLineAction = "START" | "DONE" | "WAIT_PARTS";
export type RepairFindingState = "WAITING_ESTIMATE" | "WAITING_APPROVAL" | "APPROVED" | "DECLINED";
export type PartRowStatus = "REQUESTED" | "READY" | "PARTLY_COLLECTED" | "COLLECTED";

export interface WorkLine {
  id: string;
  kind: "SERVICE" | "LABOUR";
  description: string;
  payer: EstimatePayer;
  supplementary: boolean;
  status: WorkLineStatus;
  /** Approved hours, as a 2-decimal string. */
  hours: string;
  technician: string | null;
  startedAt: string | null;
  doneAt: string | null;
  secondsWorked: number;
}

export interface RepairFinding {
  id: string;
  description: string;
  raisedBy: string | null;
  raisedAt: string;
  kind: "PART" | "FINDING";
  items: { id: string; kind: "LABOUR" | "PART" | "OIL"; description: string; quantity: string }[];
  state: RepairFindingState;
  estimateId: string | null;
  estimateVersion: number | null;
}

export interface PartRow {
  sparePartId: string;
  description: string;
  requested: number;
  requestedAt: string | null;
  issued: number;
  issuedAt: string | null;
  issuedBy: string | null;
  collected: number;
  collectedAt: string | null;
  collectedBy: string | null;
  status: PartRowStatus;
}

export interface CollectablePart {
  issuanceId: string;
  description: string;
  quantity: number;
  issuedBy: string | null;
}

export interface JobRepairStep {
  jobCardId: string;
  jobNumber: string;
  stage: JobStage;
  status: string;
  paused: boolean;
  serverNow: string;
  technician: string | null;
  serviceAdvisor: string | null;
  access: { canWork: boolean; canCollect: boolean; canPrepareSupplementary: boolean };
  workLines: WorkLine[];
  qualityCheckProblems: string[];
  findings: RepairFinding[];
  parts: { rows: PartRow[]; ready: number; outstanding: number; total: number; collectable: CollectablePart[] };
  labour: { id: string; description: string; hours: string; technician: string | null; recordedAt: string }[];
  supplementary: { estimateId: string; version: number; state: "DRAFT" | "PRESENTED" | "DECIDED" } | null;
  supplementaryPending: boolean;
  returnedFromQc: { by: string | null; at: string; note: string | null } | null;
}

export interface RepairFindingPayload {
  requestId: string;
  kind: "PART" | "FINDING";
  description: string;
  items: { kind: "LABOUR" | "PART"; referenceId: string; quantity: number }[];
}

export type MyJobTab = "TODAY" | "WAITING_PARTS" | "DONE";

export interface MyJob {
  id: string;
  jobNumber: string;
  plate: string | null;
  model: string | null;
  year: number | null;
  bay: string | null;
  stage: JobStage;
  status: string;
  promisedAt: string | null;
  returnedFromQc: { note: string | null; at: string | null } | null;
  sentForQcAt: string | null;
  next: { kind: "DIAGNOSIS" | "REPAIR" | "COLLECT" | "WAITING" | "VIEW"; label: string; detail: string };
}

export interface MyJobsResponse {
  tab: MyJobTab;
  counts: Record<MyJobTab, number>;
  page: number;
  limit: number;
  total: number;
  jobs: MyJob[];
}
