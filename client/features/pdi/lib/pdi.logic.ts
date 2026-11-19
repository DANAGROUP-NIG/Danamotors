// Pure display helpers for the PDI screens. Money is summed in kobo (integers) so totals never drift;
// the server recalculates every amount that is saved.
import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import type { ChargeType, DefectDraft, Money, PdiBillType, PdiStatus } from "../types/pdi.types";

export const PDI_PERMISSIONS = {
  READ: "pdi:read",
  CREATE: "pdi:create",
  UPDATE: "pdi:update",
  BILL: "pdi:bill",
  SETTINGS: "pdi:settings",
} as const;

export const PDI_STATUS: Record<PdiStatus, { label: string; tone: StatusTone }> = {
  OPEN: { label: "Open", tone: "blue" },
  IN_PROGRESS: { label: "In progress", tone: "amber" },
  WAITING_PARTS: { label: "Waiting parts", tone: "orange" },
  QC: { label: "Work done", tone: "purple" },
  READY: { label: "Vehicle ready", tone: "emerald" },
  BILLED: { label: "Billed", tone: "gray" },
  DELIVERED: { label: "Delivered", tone: "gray" },
  CANCELLED: { label: "Cancelled", tone: "red" },
};

/** The PDI path shown on the status stepper. */
export const PDI_STEPS: { key: PdiStatus; label: string }[] = [
  { key: "OPEN", label: "Opened" },
  { key: "IN_PROGRESS", label: "Work in progress" },
  { key: "QC", label: "Work done" },
  { key: "READY", label: "Vehicle ready" },
  { key: "BILLED", label: "Billed" },
];

/** Index of the current step; WAITING_PARTS sits on "work in progress", DELIVERED after billing. */
export function stepIndex(status: PdiStatus) {
  if (status === "WAITING_PARTS") return 1;
  if (status === "DELIVERED") return PDI_STEPS.length;
  return PDI_STEPS.findIndex(step => step.key === status);
}

export const CHARGE_TYPES: { value: ChargeType; label: string; short: string; hint: string }[] = [
  { value: "CUSTOMER", label: "Non-warranty", short: "Paid", hint: "Charged on the PDI bill" },
  { value: "WARRANTY", label: "Warranty", short: "W", hint: "Manufacturer pays; own requisition series" },
  { value: "FREE", label: "Free of cost", short: "FOC", hint: "Dealer bears the cost" },
  { value: "GOODWILL", label: "Goodwill", short: "GW", hint: "Split between company and customer" },
];

export const chargeLabel = (type: ChargeType | string) => CHARGE_TYPES.find(row => row.value === type)?.label ?? type;
export const chargeTone = (type: ChargeType | string): StatusTone =>
  type === "WARRANTY" ? "purple" : type === "FREE" ? "emerald" : type === "GOODWILL" ? "amber" : "blue";

export const BILL_TYPES: { value: PdiBillType; label: string; hint: string }[] = [
  { value: "ZERO", label: "Zero bill", hint: "Nothing chargeable: all warranty or free of cost" },
  { value: "CASH", label: "Cash memo", hint: "Paid now; prints as the PDI cash memo" },
  { value: "INVOICE", label: "Invoice (credit)", hint: "To a credit company; prints as the PDI invoice" },
];

const kobo = (value: Money | null | undefined) => Math.round((Number(value) || 0) * 100);
const naira = (value: number) => value / 100;

export function sumMoney(values: (Money | null | undefined)[]) {
  return naira(values.reduce<number>((total, value) => total + kobo(value), 0));
}

export function defectLineTotal(line: Pick<DefectDraft, "spare" | "oil" | "labour">) {
  return sumMoney([line.spare, line.oil, line.labour]);
}

export function defectGridTotals(lines: Pick<DefectDraft, "spare" | "oil" | "labour">[]) {
  return {
    spare: sumMoney(lines.map(line => line.spare)),
    oil: sumMoney(lines.map(line => line.oil)),
    labour: sumMoney(lines.map(line => line.labour)),
    total: sumMoney(lines.map(defectLineTotal)),
  };
}

/** A defect line can be saved when it names a defect from the master or describes one. */
export const defectLineValid = (line: Pick<DefectDraft, "defectId" | "description">) => !!line.defectId || line.description.trim().length > 0;

/** Same rule as the server: last 6 letters or digits of the VIN. */
export function pdiRegistrationFromVin(vin: string) {
  return vin.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(-6);
}

/** Quantity still returnable on a requisition line: issued less returns that were not cancelled. */
export function returnable(line: { quantityIssued: number; returns: { quantity: number; status: string }[] }) {
  const returned = line.returns.filter(row => !["REJECTED", "CANCELLED"].includes(row.status.toUpperCase())).reduce((total, row) => total + row.quantity, 0);
  return Math.max(0, line.quantityIssued - returned);
}

export function formatMoney(value: Money | null | undefined) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(value ?? 0));
}

export function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Lagos" }) : "—";
}

export function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : "—";
}

export const personName = (person?: { firstName: string; lastName: string } | null) => person ? `${person.firstName} ${person.lastName}`.trim() : "—";

/** Error text from an API failure: field errors first, then the message. */
export function apiError(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { message?: string; errors?: { message: string }[] } } })?.response?.data;
  return data?.errors?.[0]?.message ?? data?.message ?? fallback;
}
