import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import type { IndentStatus, MobisOrderMode, TransportMode } from "../types/indent.types";

export const INDENT_STATUS_LABELS: Record<IndentStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  PICKING: "Picking",
  PICKED: "Ready to dispatch",
  STN_CREATED: "STN created",
  PACKED: "Packed",
  DISPATCHED: "Dispatched",
  IN_TRANSIT: "In transit",
  SRN_CREATED: "SRN created",
  PARTIALLY_RECEIVED: "Partly received",
  RECEIVED: "Received",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const INDENT_STATUS_TONES: Record<IndentStatus, StatusTone> = {
  DRAFT: "gray",
  SUBMITTED: "amber",
  APPROVED: "blue",
  PICKING: "blue",
  PICKED: "blue",
  STN_CREATED: "purple",
  PACKED: "purple",
  DISPATCHED: "purple",
  IN_TRANSIT: "purple",
  SRN_CREATED: "orange",
  PARTIALLY_RECEIVED: "orange",
  RECEIVED: "emerald",
  COMPLETED: "emerald",
  REJECTED: "red",
  CANCELLED: "gray",
};

/** Statuses a list can be filtered by (the in-between stages are never stored as current status). */
export const INDENT_FILTER_STATUSES: IndentStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "PICKED",
  "IN_TRANSIT",
  "PARTIALLY_RECEIVED",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

// Legacy dispatch modes: Courier / Air / Logistics vehicle / Hand / Door delivery.
export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  ROAD: "Logistics vehicle (road)",
  COURIER: "Courier",
  AIR: "Air",
  HAND_DELIVERY: "Hand delivery",
  DOOR_DELIVERY: "Door delivery",
  SEA: "Sea",
};

export const MOBIS_ORDER_MODE_LABELS: Record<MobisOrderMode, string> = {
  AIR: "Air",
  COURIER: "Courier",
};

export function fmtDate(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
}

export function fmtDateTime(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export function fmtCurrency(n: number) {
  return `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function personName(p?: { firstName: string; lastName: string } | null) {
  return p ? `${p.firstName} ${p.lastName}` : "—";
}
