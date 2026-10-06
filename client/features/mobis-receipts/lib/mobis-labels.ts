import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import type { MitStatus, ReceivedMode } from "../types/mobis.types";

export const MIT_STATUS_LABELS: Record<MitStatus, string> = {
  IN_TRANSIT: "Awaiting MRN",
  VERIFIED: "Verified",
  PARTIALLY_RECEIVED: "Partly received",
  RECEIVED: "Received (MRN posted)",
  CANCELLED: "Cancelled",
};

export const MIT_STATUS_TONES: Record<MitStatus, StatusTone> = {
  IN_TRANSIT: "amber",
  VERIFIED: "blue",
  PARTIALLY_RECEIVED: "orange",
  RECEIVED: "emerald",
  CANCELLED: "gray",
};

// Legacy "Received mode": air, ship, road.
export const RECEIVED_MODE_LABELS: Record<ReceivedMode, string> = {
  AIR: "Air",
  SEA: "Ship",
  ROAD: "Road",
};

export const DEFAULT_CONVERSION_RATE = 2700;

/** Vendor price with two decimals (the invoice currency). */
export const fmtPrice = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtNaira = (n: number) => `₦${fmtPrice(n)}`;
export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

/** The Central Parts Department receives Mobis stock (legacy store location DH). */
export function isCpd(branch: { name: string; code?: string | null }) {
  return branch.code === "DH" || /\bcpd\b|central parts/i.test(branch.name);
}
