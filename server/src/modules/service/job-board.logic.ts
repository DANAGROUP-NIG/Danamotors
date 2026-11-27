import type { JobStage } from "@prisma/client";
import { z } from "zod";

/**
 * Workshop board (job card revamp phase 10): every active job of a branch by step, for supervisors and
 * managers. Pure rules only; job-board.service.ts does the database work.
 */

/** The board's columns, left to right. Waiting parts is the repair step paused for parts. */
export const BOARD_COLUMNS = [
  "CHECK_IN",
  "DIAGNOSIS",
  "WARRANTY",
  "AWAITING_APPROVAL",
  "IN_REPAIR",
  "WAITING_PARTS",
  "QUALITY_CHECK",
  "READY",
] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/** The steps a job is "active" in: everything from check-in until it is delivered or cancelled. */
export const ACTIVE_STAGES = [
  "CHECK_IN",
  "DIAGNOSIS",
  "WARRANTY",
  "ESTIMATE",
  "REPAIR",
  "QUALITY_CHECK",
  "BILLING",
  "DELIVERY",
] as const satisfies readonly JobStage[];

/** Each column shows at most this many cards; the rest are in the table view. */
export const BOARD_COLUMN_CAP = 50;

/**
 * The column a job sits in. Billing and Delivery both show as Ready: the work is finished and the vehicle is
 * waiting for its invoice, payment or the customer. TODO(confirm): whether QC-passed jobs not yet marked ready
 * belong in Ready.
 */
export function boardColumn(stage: JobStage, status: string): BoardColumn | null {
  switch (stage) {
    case "CHECK_IN":
    case "DIAGNOSIS":
    case "WARRANTY":
    case "QUALITY_CHECK":
      return stage;
    case "ESTIMATE":
      return "AWAITING_APPROVAL";
    case "REPAIR":
      return status === "WAITING_PARTS" ? "WAITING_PARTS" : "IN_REPAIR";
    case "BILLING":
    case "DELIVERY":
      return "READY";
    default:
      return null;
  }
}

/**
 * Columns counted as "In workshop": the vehicle is past reception and not finished. Check-in is still at the
 * service desk and Ready is waiting for the customer. TODO(confirm) with the service manager.
 */
const IN_WORKSHOP: readonly BoardColumn[] = ["DIAGNOSIS", "WARRANTY", "AWAITING_APPROVAL", "IN_REPAIR", "WAITING_PARTS", "QUALITY_CHECK"];

export type BoardCountRow = { stage: JobStage; status: string; total: number; overdue: number };

export type BoardSummary = {
  inWorkshop: number;
  awaitingApproval: number;
  waitingParts: number;
  readyForCollection: number;
  overdue: number;
};

/** Folds the grouped count (per step and status) into column totals and the five summary figures. */
export function foldBoardCounts(rows: readonly BoardCountRow[]): { totals: Record<BoardColumn, number>; summary: BoardSummary } {
  const totals = Object.fromEntries(BOARD_COLUMNS.map((column) => [column, 0])) as Record<BoardColumn, number>;
  let overdue = 0;
  for (const row of rows) {
    const column = boardColumn(row.stage, row.status);
    if (!column) continue;
    totals[column] += row.total;
    // Overdue: the promised time has passed before the job reached Ready. TODO(confirm).
    if (column !== "READY") overdue += row.overdue;
  }
  return {
    totals,
    summary: {
      inWorkshop: IN_WORKSHOP.reduce((sum, column) => sum + totals[column], 0),
      awaitingApproval: totals.AWAITING_APPROVAL,
      waitingParts: totals.WAITING_PARTS,
      readyForCollection: totals.READY,
      overdue,
    },
  };
}

/**
 * Groups cards into columns, longest in their step first, at most `cap` per column. Cards for closed or
 * cancelled jobs are dropped.
 */
export function groupBoardCards<T extends { stage: JobStage; status: string; enteredAt: Date; id: string }>(
  cards: readonly T[],
  cap = BOARD_COLUMN_CAP,
): Record<BoardColumn, T[]> {
  const columns = Object.fromEntries(BOARD_COLUMNS.map((column) => [column, [] as T[]])) as Record<BoardColumn, T[]>;
  const sorted = [...cards].sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime() || a.id.localeCompare(b.id));
  for (const card of sorted) {
    const column = boardColumn(card.stage, card.status);
    if (column && columns[column].length < cap) columns[column].push(card);
  }
  return columns;
}

export type StageTargets = {
  stageTargetCheckInMinutes: number;
  stageTargetDiagnosisMinutes: number;
  stageTargetWarrantyMinutes: number;
  stageTargetEstimateMinutes: number;
  stageTargetQualityCheckMinutes: number;
};

/** Minutes allowed in each column before the time shows over target; null where there is no target. */
export function columnTargets(settings: StageTargets): Record<BoardColumn, number | null> {
  return {
    CHECK_IN: settings.stageTargetCheckInMinutes,
    DIAGNOSIS: settings.stageTargetDiagnosisMinutes,
    WARRANTY: settings.stageTargetWarrantyMinutes,
    AWAITING_APPROVAL: settings.stageTargetEstimateMinutes,
    IN_REPAIR: null,
    WAITING_PARTS: null,
    QUALITY_CHECK: settings.stageTargetQualityCheckMinutes,
    READY: null,
  };
}

const LAGOS_OFFSET = "+01:00";
const DAY_MS = 86_400_000;

/** The instant range of a calendar day in Lagos (no daylight saving), for the "Received" filter. */
export function lagosDayRange(date: string): { gte: Date; lt: Date } {
  const gte = new Date(`${date}T00:00:00${LAGOS_OFFSET}`);
  return { gte, lt: new Date(gte.getTime() + DAY_MS) };
}

const uuid = (field: string) => z.string().uuid(`Choose a ${field} from the list`);

export const boardQuery = z
  .object({
    branchId: uuid("branch").optional(),
    advisorId: uuid("service advisor").optional(),
    technicianId: uuid("technician").optional(),
    /** Jobs received (opened) on this Lagos calendar day. Without it, every active job shows. */
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the received date as YYYY-MM-DD")
      .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Enter a real received date")
      .optional(),
  })
  .strict();
export type BoardQuery = z.infer<typeof boardQuery>;

/** The filters the database query uses, after the branch is settled. */
export type BoardFilter = {
  branchId: string;
  advisorId?: string;
  technicianId?: string;
  received?: { gte: Date; lt: Date };
};

export function boardFilter(query: BoardQuery, branchId: string): BoardFilter {
  return {
    branchId,
    ...(query.advisorId ? { advisorId: query.advisorId } : {}),
    ...(query.technicianId ? { technicianId: query.technicianId } : {}),
    ...(query.date ? { received: lagosDayRange(query.date) } : {}),
  };
}
