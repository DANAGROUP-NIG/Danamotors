import { BadRequestError } from "../../shared/errors/appError";

export const BILLABLE_STATUSES = ["READY", "Ready", "Completed"];

/** The quality check status of a job billed only for the estimation charge: there was no work to check. */
export const QC_NOT_REQUIRED = "NOT_REQUIRED";

/** Readiness is rechecked at billing time, including delivered-on-credit work. */
export function assertJobBillingReady(job: {
  status: string;
  qcStatus: string | null;
  creditApprovedById: string | null;
  /** The customer declined all work and the estimation charge was added: there was no work to check. */
  estimationChargeAdded?: boolean;
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
  if (job.estimationChargeAdded && job.qcStatus === QC_NOT_REQUIRED) return;
  if (job.qcStatus?.toUpperCase() !== "PASSED") {
    throw new BadRequestError(
      "Record a passed quality check on the job card before billing",
    );
  }
}
