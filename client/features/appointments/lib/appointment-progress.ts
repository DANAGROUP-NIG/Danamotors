import { canonicalJobStatus } from "@/features/job-cards/types/job-card-status";
import type {
  Appointment,
  AppointmentStatus,
} from "../types/appointment.types";

export const APPOINTMENT_STEPS = [
  "Pending",
  "Checked In",
  "Inspection",
  "Awaiting Approval",
  "In Repair",
  "Quality Check",
  "Ready",
  "Completed",
] as const;

type AppointmentStep = (typeof APPOINTMENT_STEPS)[number];
export type AppointmentProgress = AppointmentStatus | "Linked jobs cancelled";

const JOB_STEPS: Partial<Record<string, AppointmentStep>> = {
  OPEN: "Inspection",
  OPENED: "Inspection",
  TECHNICIAN_ASSIGNED: "Inspection",
  INSPECTION_SUBMITTED: "Awaiting Approval",
  AWAITING_WARRANTY: "Awaiting Approval",
  WARRANTY_RESOLVED: "Awaiting Approval",
  ESTIMATE_PREPARED: "Awaiting Approval",
  ESTIMATE_APPROVED: "In Repair",
  PARTS_REQUESTED: "In Repair",
  PARTS_ISSUED: "In Repair",
  WAITING_PARTS: "In Repair",
  IN_PROGRESS: "In Repair",
  REWORK: "In Repair",
  AWAITING_QC: "Quality Check",
  QC: "Quality Check",
  QC_PASSED: "Quality Check",
  READY_FOR_BILLING: "Ready",
  READY: "Ready",
  BILLED: "Ready",
  DELIVERED: "Completed",
};

export function getAppointmentProgress(
  appointment: Pick<Appointment, "status" | "jobCards">,
): AppointmentProgress {
  const { status, jobCards } = appointment;
  if (status === "Cancelled" || status === "No Show") return status;

  const activeJobs = jobCards?.filter(
    (job) => canonicalJobStatus(job.status) !== "CANCELLED",
  );
  if (jobCards?.length && !activeJobs?.length) return "Linked jobs cancelled";

  const linkedSteps = (activeJobs ?? []).flatMap((job) => {
    const jobStatus = canonicalJobStatus(job.status);
    const stage = job.serviceWorkflow?.stage;
    const step =
      jobStatus === "DELIVERED"
        ? "Completed"
        : (stage && JOB_STEPS[stage]) || JOB_STEPS[jobStatus];
    return step ? [step] : [];
  });

  // TODO(confirm): For older bookings with several jobs, wait for the least advanced active job.
  return (
    APPOINTMENT_STEPS.find((step) => linkedSteps.includes(step)) ??
    (status === "Checked In" ? "Inspection" : status)
  );
}
