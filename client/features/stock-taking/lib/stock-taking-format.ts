import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import { STOCK_AUDIT_PERMISSIONS, STOCK_TAKE_PERMISSIONS } from "@/features/auth/roles";
import type { CountSheet, Kind, StockAuditLevel, StockTakeStatus, StockTakeType } from "../types/stock-taking.types";

export { fmtCurrency, fmtDate, fmtDateTime } from "@/features/stock-transfers/lib/indent-status";

// Legacy PSTBatchHead status: A active, M completed, L closed, C cancelled.
export const STATUS_LABELS: Record<StockTakeStatus, string> = {
  ACTIVE: "Counting",
  COMPLETED: "Completed",
  CONFIRMED: "S/E confirmed",
  CANCELLED: "Cancelled",
};

export const STATUS_TONES: Record<StockTakeStatus, StatusTone> = {
  ACTIVE: "blue",
  COMPLETED: "amber",
  CONFIRMED: "emerald",
  CANCELLED: "gray",
};

export const TYPE_LABELS: Record<StockTakeType, string> = {
  ANNUAL: "Annual",
  PERPETUAL: "Perpetual",
  AUDIT: "Audit",
};

// Legacy Stock Audit menu (PSTType 1, 2, 3).
export const AUDIT_LEVEL_LABELS: Record<StockAuditLevel, string> = {
  INTERNAL: "Internal audit",
  AUDIT_HEAD: "Audit by audit head",
  VISITING_MANAGEMENT: "Audit by visiting management",
};

/**
 * Physical stock taking and stock audit share every screen (legacy Batch Creation serves both);
 * this is what differs. An audit is counted the same way but completing it is final: no S/E
 * confirmation, no bin update, and its sheets never show system stock.
 */
export const KINDS = {
  COUNT: {
    title: "Stock Taking",
    noun: "stock taking",
    base: "/inventory/stock-taking",
    report: "physical-stock",
    permissions: STOCK_TAKE_PERMISSIONS,
  },
  AUDIT: {
    title: "Stock Audit",
    noun: "stock audit",
    base: "/inventory/stock-audit",
    report: "stock-audit",
    permissions: STOCK_AUDIT_PERMISSIONS,
  },
} as const;

export const kindOf = (type: StockTakeType): Kind => (type === "AUDIT" ? "AUDIT" : "COUNT");

// Legacy "Source of Purchase" (part flag).
export const PART_FLAG_LABELS: Record<string, string> = {
  O: "Original",
  A: "Authorised source",
  L: "Local",
  F: "FOC item",
};

// Stock movement types as the stock reports name them.
export const MOVEMENT_LABELS: Record<string, string> = {
  STOCKED: "Opening stock",
  RECEIVED: "MRN",
  TRANSFER_IN: "SRN",
  RETURNED: "Return",
  ADJUSTMENT: "SAN",
  ISSUED: "Issue",
  TRANSFER_OUT: "STN",
};

export const userName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : "");

export const sheetIsOpen = (s: Pick<CountSheet, "uploadedAt" | "cancelledAt">) => !s.uploadedAt && !s.cancelledAt;

export function sheetStatus(s: Pick<CountSheet, "uploadedAt" | "cancelledAt">): { label: string; tone: StatusTone } {
  if (s.cancelledAt) return { label: "Cancelled", tone: "gray" };
  if (s.uploadedAt) return { label: "Uploaded", tone: "emerald" };
  return { label: "With checker", tone: "blue" };
}

/** Whole, non-negative count from an input; null when blank or invalid. */
export function toCount(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Discrepancy text: "+3", "−39", "0". */
export const fmtDiff = (n: number | null) => (n == null ? "—" : n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
