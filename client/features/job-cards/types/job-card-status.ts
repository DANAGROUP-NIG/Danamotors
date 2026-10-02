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
export const JOB_CARD_STATUS_LABELS = Object.fromEntries(
  Object.keys(JOB_CARD_STATUS_TONES).map((status) => [status, status]),
) as Record<JobCardStatus, string>;
