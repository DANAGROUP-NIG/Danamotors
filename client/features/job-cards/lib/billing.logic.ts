import { z } from "zod";
import { formatDateTime, formatMoney } from "@/lib/format";
import { roleLabel } from "@/lib/role-label";
import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import type {
  ChargeGroup,
  JobBillingStep,
  PaymentStatus,
  ReadyChannel,
  ReadyNotice,
  StorageView,
} from "../types/job-billing.types";

/**
 * Billing (job card revamp phase 8): the wording and rules the Billing step shows. The server decides
 * (server/src/modules/service/job-billing-step.logic.ts); these only phrase its answers.
 */

export const CHANNEL_LABELS: Record<ReadyChannel, string> = { PHONE_CALL: "Phone call", SMS: "SMS" };

/** "SMS sent to 0803 555 0142 on 27 Nov 2026, 15:10" or "Phone call to ...". */
export function noticeLine(notice: Pick<ReadyNotice, "channel" | "phone" | "at">): string {
  const to = notice.phone?.trim() || "the customer";
  const how = notice.channel === "SMS" ? `SMS sent to ${to}` : `Phone call to ${to}`;
  return `${how} on ${formatDateTime(notice.at)}`;
}

/** The muted storage line under the notice (terms clause 3). */
export function storageLine(storage: StorageView | null): string | null {
  if (!storage) return null;
  const rate = formatMoney(storage.dailyRate);
  if (storage.notifiedAt === null)
    return `Storage charge of ${rate} per day starts ${storage.freeHours} hours after the customer is told the vehicle is ready (terms clause 3).`;
  const start = `Storage charge of ${rate} per day starts after ${formatDateTime(storage.freeUntil)} (terms clause 3).`;
  if (storage.days <= 0) return start;
  const days = `${storage.days} ${storage.days === 1 ? "day" : "days"}`;
  return storage.running
    ? `${start} ${days} so far: ${formatMoney(storage.proposedAmount)} will be proposed on the invoice.`
    : `${start} Counted to the invoice: ${days}, ${formatMoney(storage.proposedAmount)}.`;
}

export const COMPARISON_LABELS: Record<ChargeGroup | "TOTAL", string> = {
  PARTS: "Parts",
  OIL: "Oil",
  LABOUR: "Labour",
  SERVICE_CHARGE: "Service charge",
  TOTAL: "Total",
};

/** "+₦8,500.00", "-₦45,000.00" or "₦0.00". The sign is in the text, so colour is never the only signal. */
export function differenceText(difference: string): string {
  const trimmed = difference.trim();
  if (/^-/.test(trimmed)) return `-${formatMoney(trimmed.slice(1))}`;
  if (/^0+(\.0+)?$/.test(trimmed)) return formatMoney(trimmed);
  return `+${formatMoney(trimmed)}`;
}

export function differenceTone(difference: string): "over" | "under" | "same" {
  const value = difference.trim();
  if (/^-/.test(value)) return "under";
  return /^0+(\.0+)?$/.test(value) ? "same" : "over";
}

export const PAYMENT_BADGE: Record<PaymentStatus, { label: string; tone: StatusTone }> = {
  NOT_INVOICED: { label: "Not invoiced", tone: "gray" },
  NOTHING_TO_PAY: { label: "Nothing to pay", tone: "emerald" },
  UNPAID: { label: "Unpaid", tone: "amber" },
  PART_PAID: { label: "Part paid", tone: "blue" },
  PAID: { label: "Paid", tone: "emerald" },
};

/** "Credit approved by Funmi Oladele (Service manager), 27 Nov 2026, 15:30." */
export function creditLine(credit: NonNullable<JobBillingStep["credit"]>): string {
  const who = credit.by ?? "a manager";
  const role = credit.role ? ` (${roleLabel(credit.role)})` : "";
  const when = credit.at ? `, ${formatDateTime(credit.at)}` : "";
  return `Credit approved by ${who}${role}${when}.`;
}

/** Why "Create invoice" cannot be used now, or null when it can. */
export function invoiceBlockedReason(step: JobBillingStep): string | null {
  if (step.invoice) return null;
  if (step.status === "QC") return "Mark the vehicle ready before creating the invoice.";
  if (step.nothingToPay) return "Nothing to invoice: the customer has nothing to pay on this job.";
  if (step.draft?.blockers.length) return step.draft.blockers[0];
  if (!step.access.canCreateInvoice) return "Only billing staff can create the invoice.";
  return null;
}

/** Why "Record payment" cannot be used now, or null when it can. */
export function paymentBlockedReason(step: JobBillingStep): string | null {
  if (!step.invoice) return step.nothingToPay ? "Nothing to pay on this job." : "Create the invoice first.";
  if (Number(step.invoice.balanceDue) <= 0) return "The invoice is paid in full.";
  if (!step.access.canRecordPayment) return "Only cashiers can record payments.";
  return null;
}

/** What the invoice card shows: the invoice once created, else the draft before it. */
export function invoiceFigures(step: JobBillingStep): { total: string | null; advancePaid: string; paymentsReceived: string | null; balanceDue: string | null } {
  if (step.invoice)
    return {
      total: step.invoice.total,
      advancePaid: step.invoice.advancePaid,
      paymentsReceived: Number(step.invoice.paymentsReceived) > 0 ? step.invoice.paymentsReceived : null,
      balanceDue: step.invoice.balanceDue,
    };
  return { total: step.draft?.total ?? null, advancePaid: step.draft?.advancePaid ?? "0.00", paymentsReceived: null, balanceDue: step.draft?.balanceDue ?? null };
}

// ---------------------------------------------------------------------------------------------
// Forms

export const readyNoticeSchema = z.object({
  channel: z.enum(["PHONE_CALL", "SMS"], { errorMap: () => ({ message: "Choose how you told the customer: phone call or SMS." }) }),
  note: z.string().trim().max(500, "Keep the note to 500 characters or fewer."),
});
export type ReadyNoticeValues = z.infer<typeof readyNoticeSchema>;

export const storageDecisionSchema = z
  .object({
    decision: z.enum(["ACCEPT", "REMOVE"], { errorMap: () => ({ message: "Accept the storage charge, or remove it with a reason." }) }),
    reason: z.string().trim().max(500, "Keep the reason to 500 characters or fewer."),
  })
  .refine((value) => value.decision !== "REMOVE" || value.reason.length >= 3, {
    path: ["reason"],
    message: "Give the reason for removing the storage charge.",
  });
export type StorageDecisionValues = z.infer<typeof storageDecisionSchema>;
