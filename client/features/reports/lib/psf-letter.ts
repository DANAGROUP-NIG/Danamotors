import { fmtDate } from "./report-format";
import type { ReportRow } from "../types";

/** Text for each {{placeholder}} of the post-service follow-up letter, from a psf-letter row (the customer's latest job). */
export function psfLetterValues(row: ReportRow, today: Date): Record<string, string> {
  const text = (key: string) => (row[key] === null || row[key] === undefined ? "" : String(row[key]));
  return {
    customer: text("customer") || "Valued customer",
    customerAddress: text("customerAddress"),
    registration: text("registration") || "your vehicle",
    registrations: text("registrations"),
    model: text("model") || "vehicle",
    jobNumber: text("jobNumber"),
    deliveryDate: fmtDate(row.deliveredAt),
    serviceType: text("serviceType"),
    branch: text("branchName"),
    branchAddress: text("branchAddress"),
    branchPhone: text("branchPhone"),
    branchEmail: text("branchEmail"),
    date: fmtDate(today),
  };
}
