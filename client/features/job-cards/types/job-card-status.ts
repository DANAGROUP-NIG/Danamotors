import type { StatusTone } from "@/components/ui/table-components/StatusBadge";

export const JOB_CARD_STATUS_TONES = {
  OPEN: "amber", IN_PROGRESS: "blue", QC: "blue", READY: "emerald", BILLED: "emerald", DELIVERED: "gray", CANCELLED: "red",
  Open: "amber",
  Pending: "amber",
  "In Progress": "blue",
  "On Hold": "gray",
  "Quality Check": "blue",
  Ready: "emerald",
  Completed: "emerald",
  Closed: "gray",
  Billed: "emerald",
  Cancelled: "red",
} satisfies Record<string, StatusTone>;

export type JobCardStatus = keyof typeof JOB_CARD_STATUS_TONES;
export function canonicalJobStatus(status: string): string {
  const aliases: Record<string, string> = {
    Open: "OPEN", Pending: "OPEN", "In Progress": "IN_PROGRESS", "On Hold": "IN_PROGRESS",
    "Quality Check": "QC", Ready: "READY", Completed: "READY", Billed: "BILLED", Closed: "DELIVERED", Cancelled: "CANCELLED",
  };
  return aliases[status] ?? status;
}

export function hasJobBill(card: { billedAt?: string | null; status: string; invoices?: { status: string }[] }): boolean {
  return !!card.billedAt || canonicalJobStatus(card.status) === "BILLED" || !!card.invoices?.some(
    (invoice) => !["CANCELLED", "CANCELED", "VOID"].includes(invoice.status.toUpperCase()),
  );
}
export const JOB_CARD_STATUS_LABELS = Object.fromEntries(
  Object.keys(JOB_CARD_STATUS_TONES).map((status) => [status, canonicalJobStatus(status).replaceAll("_", " ")]),
) as Record<JobCardStatus, string>;
