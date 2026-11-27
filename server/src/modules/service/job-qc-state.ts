import type { Prisma } from "@prisma/client";
import { qcStateOf, type QcState } from "./job-quality-check.logic";

/**
 * The job's QC result lives on its inspections (phase 7). These helpers are the one way to read it
 * and to put a job back to "pending". A job has at most one current inspection (supersededAt null).
 */

/** Add to a JobCard select or include wherever the QC result is needed; read it with qcStateFrom. */
export const QC_STATE_SELECT = {
  inspections: {
    where: { supersededAt: null },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { result: true },
  },
  estimationCharge: { select: { status: true } },
} satisfies Prisma.JobCardSelect;

export interface QcStateRow {
  inspections: { result: "PASSED" | "FAILED" }[];
  estimationCharge: { status: string } | null;
}

export function qcStateFrom(row: QcStateRow): QcState {
  return qcStateOf(row.inspections[0] ?? null, row.estimationCharge?.status === "ADDED");
}

export async function loadQcState(tx: Prisma.TransactionClient, jobCardId: string): Promise<QcState> {
  const row = await tx.jobCard.findUniqueOrThrow({ where: { id: jobCardId }, select: QC_STATE_SELECT });
  return qcStateFrom(row);
}

/** Jobs whose QC result is passed (for list filters). */
export const QC_PASSED_WHERE = {
  inspections: { some: { supersededAt: null, result: "PASSED" } },
} satisfies Prisma.JobCardWhereInput;

/**
 * Puts the job's QC result back to pending, keeping the inspection as history: a failed check
 * returned to repair, changed work after a pass, or a new check replacing it.
 */
export async function supersedeCurrentInspection(tx: Prisma.TransactionClient, jobCardId: string, at: Date = new Date()) {
  await tx.inspection.updateMany({ where: { jobCardId, supersededAt: null }, data: { supersededAt: at } });
}
