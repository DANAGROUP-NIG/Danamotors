import type { Prisma, PrismaClient } from "@prisma/client";
import { supersedeCurrentInspection } from "./job-qc-state";
import type { QcState } from "./job-quality-check.logic";

/**
 * Test fixtures only: puts a job's QC result straight into the state a test needs, the way the
 * old qcStatus column was set. PENDING supersedes the current inspection; PASSED or FAILED records one.
 */
export async function setQcResult(db: PrismaClient | Prisma.TransactionClient, jobCardId: string, result: Exclude<QcState, "NOT_REQUIRED">) {
  await supersedeCurrentInspection(db as Prisma.TransactionClient, jobCardId);
  if (result !== "PENDING") await db.inspection.create({ data: { jobCardId, result, notes: "Test fixture" } });
}
