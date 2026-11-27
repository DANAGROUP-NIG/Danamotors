import type { RepeatStatus } from "@/features/repeat-jobs/types/repeat-job.types";
import type { JobStage } from "./job-workspace.types";

/** The workshop board, as returned by GET /service/job-cards/board. */

export type BoardColumnKey =
  | "CHECK_IN"
  | "DIAGNOSIS"
  | "WARRANTY"
  | "AWAITING_APPROVAL"
  | "IN_REPAIR"
  | "WAITING_PARTS"
  | "QUALITY_CHECK"
  | "READY";

export type BoardCard = {
  id: string;
  jobNumber: string;
  stage: JobStage;
  status: string;
  plate: string | null;
  model: string | null;
  customer: string | null;
  owner: { name: string | null; role: string } | null;
  enteredAt: string;
  promisedAt: string | null;
  warranty: boolean;
  repeat: RepeatStatus | null;
};

export type BoardColumnData = {
  key: BoardColumnKey;
  total: number;
  /** Minutes allowed in the step before the time shows over target; null when the step has none. */
  targetMinutes: number | null;
  cards: BoardCard[];
};

export type BoardSummary = {
  inWorkshop: number;
  awaitingApproval: number;
  waitingParts: number;
  readyForCollection: number;
  overdue: number;
};

export type WorkshopBoard = {
  branchId: string;
  generatedAt: string;
  summary: BoardSummary;
  columns: BoardColumnData[];
};
