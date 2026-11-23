import { canonicalJobStatus } from "../types/job-card-status";
import type { Estimate, JobCardStatus } from "../types/job-card.types";
import { moneyText } from "@/features/service-transactions/transaction.logic";
import { WORKSPACE_COPY as COPY } from "./repair-workspace-copy";

const STEPS = [
  "OPEN",
  "IN_PROGRESS",
  "QC",
  "READY",
  "BILLED",
  "DELIVERED",
] as const;
export type StepState = "completed" | "current" | "upcoming";
export function getStepperState(jobStatus: JobCardStatus) {
  const current = canonicalJobStatus(jobStatus);
  const index = STEPS.findIndex((step) => step === current);
  return STEPS.map((status, position) => ({
    status,
    label: COPY.steps[status],
    number: position + 1,
    state: (index < 0 || position > index
      ? "upcoming"
      : position === index
        ? "current"
        : "completed") as StepState,
  }));
}
export type EstimateDisplayStatus = keyof typeof COPY.estimateStates;
export function toEstimateViewModel(estimate: Estimate) {
  const percent = Number(estimate.upfrontPaymentPercent ?? 60);
  const suggestedAdvance =
    typeof estimate.upfrontAmount === "number" &&
    Number.isFinite(estimate.upfrontAmount) &&
    estimate.upfrontAmount >= 0 &&
    Number.isFinite(percent) &&
    percent >= 0 &&
    percent <= 100
      ? { percent, amount: estimate.upfrontAmount }
      : null;
  const decision = estimate.approvals?.[0];
  const invalid = estimate.approvals?.some(
    (approval) => approval.signatureState === "invalid",
  );
  const status = estimate.status.toUpperCase().replaceAll(" ", "_");
  const displayStatus: EstimateDisplayStatus = invalid
    ? "revision"
    : status === "APPROVED"
      ? "approved"
      : status === "DECLINED"
        ? "declined"
        : status === "SUPERSEDED"
          ? "superseded"
          : status === "CANCELLED" || status === "REVISION_REQUIRED"
            ? "revision"
            : status === "DRAFT"
              ? "draft"
              : "awaiting";
  const labels: Record<string, string> = {
    SERVICE: COPY.service,
    LABOUR: COPY.labour,
    PART: COPY.parts,
    COMPLAINT: COPY.complaint,
  };
  return {
    id: estimate.id,
    version: estimate.version,
    status: displayStatus,
    description: estimate.description.replace(
      /^Workshop estimate \? revision (\d+)$/,
      "Workshop estimate, revision $1",
    ),
    currency: estimate.currency,
    total: estimate.amount,
    suggestedAdvance,
    decision,
    invalid,
    lines: (estimate.lines ?? []).map((line) => ({
      id: line.id,
      title: line.description,
      secondary: line.type.startsWith("INCLUDED_")
        ? COPY.included
        : (labels[line.type] ?? "Other work"),
      quantity: line.quantity,
      rate: line.rate,
      amount: line.amount,
    })),
  };
}
export type EstimateViewModel = ReturnType<typeof toEstimateViewModel>;
export function splitMoney(amount: number, currency: string) {
  const options: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };
  const formatted = moneyText(amount, currency);
  const separator = new Intl.NumberFormat("en-NG", options)
    .formatToParts(amount)
    .find((part) => part.type === "decimal")?.value;
  const at = separator ? formatted.lastIndexOf(separator) : -1;
  return {
    whole: at < 0 ? formatted : formatted.slice(0, at),
    decimals: at < 0 ? "" : formatted.slice(at),
  };
}
export function formatEstimateMoney(
  amount: number,
  currency: string,
  compact = false,
) {
  const { whole, decimals } = splitMoney(amount, currency);
  return whole + (compact && /[.,]00$/.test(decimals) ? "" : decimals);
}
export function formatSignedDate(date: string) {
  return new Date(date).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  });
}
