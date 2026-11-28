import { NOT_PROVIDED, formatDate, formatDateTime, formatKm, formatMoney, formatTime } from "@/lib/format";
import type { ChecklistState } from "../types/job-check-in.types";
import type { GatePassPrintData, JobCardPrintData } from "../types/job-print.types";
import { COMPARISON_LABELS } from "./billing.logic";
import { fuelLabel } from "./check-in.logic";

/**
 * The printed job card and gate pass (job card revamp phase 11): the server's print data turned
 * into the words and figures on paper. Every missing value prints the shared NOT_PROVIDED fallback;
 * dates go through the shared Lagos formatters and money through the naira formatter.
 */

const text = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return NOT_PROVIDED;
  const trimmed = String(value).trim();
  return trimmed || NOT_PROVIDED;
};

export type PrintRow = { label: string; value: string };

/** "Kia Sorento 2019", without the colour: the paper card's Model box. */
export function modelText(vehicle: { make: string | null; model: string | null; year: number | null } | null): string {
  if (!vehicle) return NOT_PROVIDED;
  const name = [vehicle.make, vehicle.model, vehicle.year].filter((part) => part !== null && part !== undefined && String(part).trim()).join(" ");
  return name || NOT_PROVIDED;
}

/** The four boxes across the top: job number, advisor, km and date. */
export function headlineRows(data: JobCardPrintData): PrintRow[] {
  return [
    { label: "Job number", value: text(data.job.number) },
    { label: "Service advisor", value: text(data.job.advisor) },
    { label: "Km (odometer)", value: formatKm(data.job.mileage) },
    { label: "Date", value: formatDate(data.job.openedAt) },
  ];
}

export function customerRows(data: JobCardPrintData): PrintRow[] {
  return [
    { label: "Name", value: text(data.customer?.name) },
    { label: "Phone", value: text(data.customer?.phone) },
    { label: "Address", value: text(data.customer?.address) },
  ];
}

export function vehicleRows(data: JobCardPrintData): PrintRow[] {
  const vehicle = data.vehicle;
  return [
    { label: "Model", value: modelText(vehicle) },
    { label: "Reg. no.", value: text(vehicle?.registration) },
    { label: "VIN", value: text(vehicle?.vin) },
    { label: "Engine no.", value: text(vehicle?.engineNumber) },
    { label: "Sold by", value: text(vehicle?.soldBy) },
    { label: "Sold on", value: formatDate(vehicle?.soldOn) },
  ];
}

/** The fuel box: "Half (1/2)", and the needle angle on the gauge (-90 empty to 90 full). */
export function fuelView(level: JobCardPrintData["fuelLevel"]): { label: string; angle: number | null } {
  const angles = { EMPTY: -90, QUARTER: -45, HALF: 0, THREE_QUARTER: 45, FULL: 90 } as const;
  return { label: fuelLabel(level), angle: level ? angles[level] : null };
}

/** The checklist box on paper: ticked when present, the word when missing or not working, blank when not checked. */
export function checklistMark(state: ChecklistState | null): { ticked: boolean; word: string | null } {
  if (state === "PRESENT") return { ticked: true, word: null };
  if (state === "MISSING") return { ticked: false, word: "Missing" };
  if (state === "NOT_WORKING") return { ticked: false, word: "Not working" };
  return { ticked: false, word: null };
}

export interface ComparisonPrintRow {
  label: string;
  estimated: string;
  actual: string;
  total: boolean;
}

/**
 * The paper card's "Estimated and actual" table: delivery date and time (promised against delivered),
 * then parts, oil, labour, service charge and total in naira. A job without figures yet prints the
 * shared fallback in each money cell.
 */
export function comparisonRows(data: JobCardPrintData): ComparisonPrintRow[] {
  const rows: ComparisonPrintRow[] = [
    { label: "Delivery date", estimated: formatDate(data.job.promisedAt), actual: formatDate(data.job.deliveredAt), total: false },
    { label: "Delivery time", estimated: formatTime(data.job.promisedAt), actual: formatTime(data.job.deliveredAt), total: false },
  ];
  const money = data.comparison.rows;
  const groups = ["PARTS", "OIL", "LABOUR", "SERVICE_CHARGE", "TOTAL"] as const;
  for (const group of groups) {
    const row = money?.find((item) => item.group === group);
    rows.push({
      label: group === "SERVICE_CHARGE" ? "Service charges" : COMPARISON_LABELS[group],
      estimated: row ? formatMoney(row.estimated) : NOT_PROVIDED,
      actual: row ? formatMoney(row.actual) : NOT_PROVIDED,
      total: group === "TOTAL",
    });
  }
  return rows;
}

export interface SignatureBoxView {
  key: string;
  title: string;
  statement: string | null;
  image: string | null;
  /** The printed name, or null for a blank name line. */
  name: string | null;
  capacity: string | null;
  /** "25 Nov 2026", or null for a blank date line. */
  date: string | null;
  note: string | null;
}

export function signatureViews(data: JobCardPrintData): SignatureBoxView[] {
  return data.signatures.map((box) => ({
    key: box.key,
    title: box.title,
    statement: box.statement,
    image: box.image,
    name: box.name?.trim() || null,
    capacity: box.capacity,
    date: box.date ? formatDate(box.date) : null,
    note: box.note,
  }));
}

/** "Last visit" and "Second last visit": date, job number, km and the work. Missing visits say so. */
export function visitLines(data: JobCardPrintData): { label: string; text: string }[] {
  return ["Last visit", "Second last visit"].map((label, index) => {
    const visit = data.previousVisits[index];
    if (!visit) return { label, text: "No earlier visit recorded" };
    return {
      label,
      text: `${formatDate(visit.date)}, job ${visit.jobNumber}, ${formatKm(visit.mileage)}, ${text(visit.work)}`,
    };
  });
}

/** "Confirmed by Kelechi Nwosu, 25 Nov 2026." under the findings, when the engineer confirmed them. */
export function signedLine(prefix: string, sign: { by: string | null; at: string } | null): string | null {
  if (!sign) return null;
  return `${prefix} ${text(sign.by)}, ${formatDate(sign.at)}.`;
}

/** The branch address line under the company name. */
export function branchLine(branch: JobCardPrintData["branch"]): string {
  return [branch.name, branch.address, branch.phone].map((part) => part?.trim()).filter(Boolean).join(", ");
}

export function gatePassRows(data: GatePassPrintData): PrintRow[] {
  return [
    { label: "Job number", value: text(data.jobNumber) },
    { label: "Gate pass number", value: text(data.gatePassNumber) },
    { label: "Registration (plate)", value: text(data.registration ?? data.vin) },
    { label: "Model", value: modelText(data.vehicle) },
    { label: "Customer", value: text(data.customer) },
    { label: "Collected by", value: text(data.collectedBy) },
    { label: "Delivered by", value: text(data.deliveredBy) },
    { label: "Date and time", value: formatDateTime(data.deliveredAt) },
  ];
}

/** "Printed 28 Nov 2026, 15:20, Lagos time" in each document's footer. */
export const printedLine = (printedAt: string) => `Printed ${formatDateTime(printedAt)}, Lagos time`;

/** The printed job card. With print, the browser's print dialog opens once it has loaded. */
export const jobCardPrintHref = (jobId: string, print = false) => `/job-cards/${jobId}/print${print ? "?print=1" : ""}`;
/** The A6 gate pass slip. */
export const gatePassPrintHref = (jobId: string, print = false) => `/job-cards/${jobId}/gate-pass/print${print ? "?print=1" : ""}`;
