import { z } from "zod";
import { formatDate, formatDateTime, NOT_PROVIDED } from "@/lib/format";
import type { CollectorType, DeliveryPayload, JobDeliveryStep } from "../types/job-delivery.types";
import { phoneProblem } from "./estimate.logic";

/**
 * Delivery (job card revamp phase 9): the advisor hands the vehicle over with the customer. Mirrors the server
 * rules in job-delivery.logic.ts so the screen can say what is missing; the server stays authoritative.
 */

export const DELIVERY_STATEMENT = "I am taking delivery of the vehicle and I am satisfied with the repairs.";
export const PHONE_APPROVAL_STATEMENT = "I confirm that I approved this work on the phone, as listed, and I accept the estimate terms.";
export const RELEASE_RULE =
  "Terms clause 7: the vehicle is released only to the owner or the person who signed the job card. A service manager or workshop manager must approve releasing it to someone else, with a reason.";
export const LATE_REASONS_NEEDED = "The promised time has passed. Choose 1 to 6 reasons for late delivery.";
export const MAX_LATE_REASONS = 6;

export interface DeliveryForm {
  collector: CollectorType | null;
  returned: string[];
  lateReasonIds: string[];
  lateRemarks: string;
  signature: string | null;
}

export const emptyDeliveryForm = (): DeliveryForm => ({ collector: null, returned: [], lateReasonIds: [], lateRemarks: "", signature: null });

export interface CollectorOption {
  type: CollectorType;
  label: string;
  /** Who signs for the vehicle with this choice, or null until a manager approves someone else. */
  person: { name: string; phone: string | null } | null;
  /** Emerald badge text when this person may collect without an override. */
  badge: string | null;
}

/** Owner, the person who signed at check-in (only when that was not the owner), and someone else. */
export function collectorOptions(step: Pick<JobDeliveryStep, "owner" | "checkInSigner" | "releaseApproval">): CollectorOption[] {
  const approval = step.releaseApproval;
  return [
    // The owner signed the job card unless a representative did.
    { type: "OWNER", label: `${step.owner.name} (owner)`, person: step.owner, badge: step.checkInSigner ? null : "Matches job card signer" },
    ...(step.checkInSigner
      ? [{ type: "CHECK_IN_SIGNER" as const, label: `${step.checkInSigner.name} (signed at check-in)`, person: step.checkInSigner, badge: "Matches job card signer" }]
      : []),
    {
      type: "OTHER",
      label: "Someone else",
      person: approval ? { name: approval.collectorName, phone: approval.collectorPhone } : null,
      badge: null,
    },
  ];
}

/** The person who signs for the vehicle with the current choice. */
export function collectorPerson(step: Pick<JobDeliveryStep, "owner" | "checkInSigner" | "releaseApproval">, type: CollectorType | null) {
  return collectorOptions(step).find((option) => option.type === type)?.person ?? null;
}

const unreturned = (step: Pick<JobDeliveryStep, "belongings">, returned: string[]) =>
  step.belongings.filter((item) => !returned.includes(item.code)).length;

/** Late reasons: 1 to 6 distinct, as the existing late-delivery rule needs. */
export function lateReasonProblem(ids: string[]): string | null {
  if (!ids.length) return LATE_REASONS_NEEDED;
  if (ids.length > MAX_LATE_REASONS) return `Reasons for late delivery: At most ${MAX_LATE_REASONS} reasons are allowed.`;
  if (new Set(ids).size !== ids.length) return "Reasons for late delivery: A reason can be selected only once.";
  return null;
}

/** Everything that still stops the handover, in the order of the screen. Empty when the advisor can complete it. */
export function deliveryProblems(step: JobDeliveryStep, form: DeliveryForm): string[] {
  const problems: string[] = [];
  if (step.paymentProblem) problems.push(step.paymentProblem);
  if (step.phoneApprovals.length) problems.push("The customer must first sign the estimate they approved on the phone.");
  const missing = unreturned(step, form.returned);
  if (missing)
    problems.push(
      missing === 1 ? "Tick Returned for every belonging: 1 is not ticked yet." : `Tick Returned for every belonging: ${missing} are not ticked yet.`,
    );
  if (!form.collector) problems.push("Choose who is collecting the vehicle.");
  else if (form.collector === "OTHER" && !step.releaseApproval) problems.push(RELEASE_RULE);
  if (step.late) {
    const late = lateReasonProblem(form.lateReasonIds);
    if (late) problems.push(late);
  }
  if (!form.signature) problems.push("The customer must sign to take delivery.");
  return problems;
}

/** The bar's reason: the first thing to do, and how many more. */
export function blockedSummary(problems: string[]): string | undefined {
  if (problems.length <= 1) return undefined;
  const more = problems.length - 1;
  return `${problems[0]} ${more} more ${more === 1 ? "thing" : "things"} to do before delivery.`;
}

export function deliveryPayload(step: JobDeliveryStep, form: DeliveryForm, requestId: string): DeliveryPayload {
  const remarks = form.lateRemarks.trim();
  return {
    requestId,
    collectorType: form.collector!,
    returnedCodes: form.returned,
    lateReasonIds: step.late ? form.lateReasonIds : [],
    ...(step.late && remarks ? { lateRemarks: remarks } : {}),
    accepted: true,
    signatureImage: form.signature!,
  };
}

const COLLECTOR_LABELS: Record<CollectorType, string> = {
  OWNER: "Owner",
  CHECK_IN_SIGNER: "Signed the job card at check-in",
  OTHER: "Someone else, approved by a manager",
};

export const collectorTypeLabel = (type: CollectorType) => COLLECTOR_LABELS[type];

/** "Delivered to Adaeze Okafor, 28 Nov 2026, 15:20", or without a name for jobs delivered before phase 9. */
export function deliveredTitle(delivered: NonNullable<JobDeliveryStep["delivered"]>): string {
  return delivered.collector
    ? `Delivered to ${delivered.collector.name}, ${formatDateTime(delivered.at)}`
    : `Delivered ${formatDateTime(delivered.at)}`;
}

export function followUpLine(date: string | null): string {
  return date ? `Follow-up call scheduled for ${formatDate(date)}.` : `Follow-up call date: ${NOT_PROVIDED}.`;
}

/** "Revision 2, approved on the phone by Adaeze Okafor (0803 555 0142), 27 Nov 2026, 10:15". */
export function phoneApprovalLine(approval: JobDeliveryStep["phoneApprovals"][number]): string {
  const who = approval.approverName?.trim() || NOT_PROVIDED;
  const phone = approval.approverPhone ? ` (${approval.approverPhone})` : "";
  const when = approval.approvedAt ? `, ${formatDateTime(approval.approvedAt)}` : "";
  return `Revision ${approval.version}, approved on the phone by ${who}${phone}${when}`;
}

export const releaseApprovalSchema = z
  .object({
    collectorName: z.string().trim().min(2, "Enter the full name of the person collecting.").max(120, "Use at most 120 characters for the name."),
    collectorPhone: z.string().trim(),
    reason: z
      .string()
      .trim()
      .min(10, "Write why the vehicle can be released to this person (at least 10 characters).")
      .max(1000, "Use at most 1,000 characters for the reason."),
  })
  .superRefine((value, ctx) => {
    const problem = phoneProblem(value.collectorPhone);
    if (problem) ctx.addIssue({ code: "custom", path: ["collectorPhone"], message: `${problem}.`.replace("..", ".") });
  });
export type ReleaseApprovalValues = z.infer<typeof releaseApprovalSchema>;

const APPROVER_ROLES: Record<string, string> = {
  ServiceManager: "Service manager",
  WorkshopManager: "Workshop manager",
  Admin: "Administrator",
  SuperAdmin: "Administrator",
};

/** The role of the manager who approved a release, in plain words. */
export const approverRoleLabel = (role: string) => APPROVER_ROLES[role] ?? "Manager";

export const signerNameSchema = z.string().trim().min(1, "Enter the name of the person signing.").max(120, "Use at most 120 characters for the name.");
