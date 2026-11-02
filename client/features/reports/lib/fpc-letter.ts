import { fmtDate } from "./report-format";
import type { ReportRow } from "../types";

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

/** Text for each {{placeholder}} of the FPC letter, from an FPC vehicles row. */
export function letterValues(row: ReportRow, today: Date): Record<string, string> {
  const text = (key: string) => (row[key] === null || row[key] === undefined ? "" : String(row[key]));
  return {
    customer: text("customer") || "Valued customer",
    customerAddress: text("customerAddress"),
    registration: text("registration") || "not recorded",
    vin: text("vin"),
    model: text("model"),
    variant: text("variant"),
    bulletin: text("bulletin"),
    subject: text("subject"),
    measures: text("measures"),
    branch: text("branchName"),
    branchAddress: text("branchAddress"),
    branchPhone: text("branchPhone"),
    branchEmail: text("branchEmail"),
    date: fmtDate(today),
  };
}

/** Fills the template; unknown placeholders are left as typed so they stand out on the proof. */
export function fillLetter(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (match, name: string) => (name in values ? values[name] : match)).replace(/[ \t]{2,}/g, " ");
}

/** Rows that can receive post: registered vehicles with a customer. */
export function mailableRows<Row extends ReportRow>(rows: Row[]): Row[] {
  return rows.filter((row) => row.registered === true && Boolean(row.customer));
}
