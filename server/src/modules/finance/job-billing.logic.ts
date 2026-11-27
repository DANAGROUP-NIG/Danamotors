import { BadRequestError } from "../../shared/errors/appError";
import type { QcState } from "../service/job-quality-check.logic";

export const BILLABLE_STATUSES = ["READY", "Ready", "Completed"];

/** Readiness is rechecked at billing time, including delivered-on-credit work. */
export function assertJobBillingReady(job: {
  status: string;
  /** From the job's current inspection (qcStateFrom). NOT_REQUIRED: only the estimation charge is billed. */
  qcState: QcState;
  creditApprovedById: string | null;
}): void {
  const ready = BILLABLE_STATUSES.includes(job.status);
  const deliveredOnCredit =
    ["DELIVERED", "Closed"].includes(job.status) && !!job.creditApprovedById;
  if (!ready && !deliveredOnCredit) {
    throw new BadRequestError(
      "Only ready jobs or jobs delivered on approved credit can be billed",
    );
  }
  // TODO(confirm): historical completed jobs without QC evidence remain blocked;
  // do not infer a passed inspection from a legacy status alone.
  if (job.qcState === "NOT_REQUIRED") return;
  if (job.qcState !== "PASSED") {
    throw new BadRequestError(
      "Record a passed quality check on the job card before billing",
    );
  }
}
