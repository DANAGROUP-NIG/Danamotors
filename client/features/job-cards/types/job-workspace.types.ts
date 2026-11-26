/** The staged job card, as returned by GET /service/job-cards/:id/workspace. */

export type JobStage =
  | "CHECK_IN"
  | "DIAGNOSIS"
  | "WARRANTY"
  | "ESTIMATE"
  | "REPAIR"
  | "QUALITY_CHECK"
  | "BILLING"
  | "DELIVERY"
  | "CLOSED"
  | "CANCELLED";

export type StageAction =
  | "SEND_TO_SUPERVISOR"
  | "SEND_TO_WARRANTY"
  | "SEND_TO_ADVISOR"
  | "WARRANTY_TO_ADVISOR"
  | "RELEASE_TO_REPAIR"
  | "PAUSE_FOR_PARTS"
  | "RESUME_REPAIR"
  | "SEND_TO_QC"
  | "QC_PASSED_TO_ADVISOR"
  | "RETURN_TO_REPAIR"
  | "MARK_READY"
  | "SEND_TO_DELIVERY"
  | "CANCEL";

export type SubStep =
  | "DETAILS"
  | "WALK_AROUND"
  | "CUSTOMER_CONSENT"
  | "SEND_TO_WORKSHOP"
  | "ASSIGN_TECHNICIAN"
  | "FINDINGS"
  | "WARRANTY_REVIEW"
  | "ESTIMATE_APPROVAL"
  | "ADVANCE_PAYMENT"
  | "RELEASE"
  | "WORK"
  | "WAITING_PARTS"
  | "INSPECTION"
  | "QC_PASSED"
  | "QC_FAILED"
  | "MARK_READY"
  | "INVOICE"
  | "HANDOVER";

export interface StageActionView {
  action: StageAction;
  kind: "primary" | "secondary" | "danger";
  enabled: boolean;
  /** Plain-English reasons the action is blocked. Empty when enabled. */
  reasons: string[];
  requiresNote: boolean;
}

export interface StageAlert {
  code: "PROMISE_PASSED" | "PROMISE_SOON" | "WAITING_PARTS" | "QC_FAILED" | "NO_TECHNICIAN" | "CAMPAIGN_ANSWERS";
  tone: "danger" | "warning";
  message: string;
}

export interface StageSummary {
  stage: Exclude<JobStage, "CLOSED" | "CANCELLED">;
  state: "COMPLETED" | "SKIPPED";
  by: string | null;
  at: string | null;
}

export interface JobWorkspace {
  jobCardId: string;
  jobNumber: string;
  jobType: "SERVICE" | "PDI";
  stage: JobStage;
  status: string;
  subStep: SubStep | null;
  owner: { id: string | null; name: string | null; role: string } | null;
  enteredAt: string;
  readOnly: boolean;
  actions: StageActionView[];
  alerts: StageAlert[];
  summaries: StageSummary[];
  cancellation: { by: string | null; at: string | null; reason: string | null } | null;
  /** The header's Warranty or Non-warranty tag. */
  warrantyJob: boolean;
  /** Step moves and handoffs, newest first. */
  activity: StageActivity[];
  /** The vehicle's last two earlier visits (any branch), newest first. */
  previousVisits: PreviousVisit[];
}

export interface StageActivity {
  id: string;
  at: string;
  fromStage: JobStage | null;
  toStage: JobStage;
  action: string | null;
  by: string | null;
  ownerName: string | null;
  ownerRole: string | null;
  note: string | null;
}

export interface PreviousVisit {
  id: string;
  jobNumber: string;
  openedAt: string;
  deliveredAt: string | null;
  mileage: number | null;
  stage: JobStage;
  branchName: string;
  service: string | null;
  requests: string[];
  workDone: string | null;
}

export interface StageActionInput {
  action: StageAction;
  note?: string;
  /** Generated once per attempt so a repeated click or retry acts only once. */
  requestId: string;
}
