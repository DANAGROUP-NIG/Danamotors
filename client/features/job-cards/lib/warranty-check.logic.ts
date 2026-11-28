import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import { formatDate, formatKm, formatMonthYear, formatQuantity } from "@/lib/format";
import type {
  CoverageStatus,
  DecisionItem,
  FindingPayer,
  JobWarrantyCheck,
  LinkedCampaign,
  MissedService,
  PeriodRow,
  PeriodStatus,
  ServiceRule,
  ServiceVerdict,
  Span,
  WarrantyCoverage,
  YearRow,
} from "../types/job-warranty.types";

/**
 * Wording and rules for the warranty check screen (job card revamp phase 4). The server decides
 * the verdict and what blocks the handoff; this file only says it in plain words.
 */

export const PAYERS: FindingPayer[] = ["WARRANTY", "GOODWILL", "CAMPAIGN", "CUSTOMER"];

export const PAYER_LABELS: Record<FindingPayer, string> = {
  WARRANTY: "Warranty",
  GOODWILL: "Goodwill",
  CAMPAIGN: "Campaign",
  CUSTOMER: "Customer pay",
};

/** Badge tones as in the design: purple for warranty, gray for customer pay. */
export const PAYER_TONES: Record<FindingPayer, StatusTone> = {
  WARRANTY: "purple",
  GOODWILL: "blue",
  CAMPAIGN: "amber",
  CUSTOMER: "gray",
};

export const ITEM_KIND_LABELS: Record<DecisionItem["kind"], string> = { LABOUR: "Labour", PART: "Part", OIL: "Oil" };

export const PERIOD_STATUS: Record<PeriodStatus, { label: string; tone: StatusTone }> = {
  ON_TIME: { label: "On time", tone: "emerald" },
  MISSED: { label: "Missed", tone: "red" },
  UPCOMING: { label: "Upcoming", tone: "gray" },
  NOT_DUE: { label: "No service due", tone: "gray" },
};

const COVERAGE_BADGE: Record<CoverageStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: "Active", tone: "emerald" },
  EXPIRED_DATE: { label: "Expired", tone: "red" },
  EXPIRED_MILEAGE: { label: "Expired by km", tone: "red" },
  NOT_COVERED: { label: "Not covered", tone: "gray" },
  UNKNOWN: { label: "Cannot confirm", tone: "amber" },
};

export const coverageBadge = (status: CoverageStatus) => COVERAGE_BADGE[status];

const plural = (count: number, word: string) => `${formatQuantity(count)} ${word}${count === 1 ? "" : "s"}`;

/** The Service history card's badge. */
export function verdictBadge(verdict: ServiceVerdict): { label: string; tone: StatusTone } {
  if (verdict.kind === "REGULAR") return { label: "Regular", tone: "emerald" };
  if (verdict.kind === "IRREGULAR") return { label: plural(verdict.missedCount, "missed service"), tone: "amber" };
  return { label: "Cannot check", tone: "gray" };
}

/** "4 months 2 weeks", "3 months 5 days", "20 days". */
export function formatSpan(span: Span): string {
  if (span.months === 0) return plural(span.days, "day");
  const weeks = Math.floor(span.extraDays / 7);
  if (weeks > 0) return `${plural(span.months, "month")} ${plural(weeks, "week")}`;
  return span.extraDays > 0 ? `${plural(span.months, "month")} ${plural(span.extraDays, "day")}` : plural(span.months, "month");
}

/** Whole months between two day strings (YYYY-MM-DD), counting a month only once its day is reached. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(0, months);
}

/** "3 years 8 months", "7 months", "2 years". */
export function formatYearsMonths(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) return plural(rest, "month");
  return rest ? `${plural(years, "year")} ${plural(rest, "month")}` : plural(years, "year");
}

/** The two Coverage bars and their captions. Null when the bar cannot be drawn. */
export function coverageView(coverage: WarrantyCoverage, asOf: string | null) {
  // The model policy is in days (1,825 for 5 years); an extended warranty or goodwill has its own end date.
  const totalMonths =
    coverage.source === "MODEL" && coverage.warrantyDays
      ? Math.round((coverage.warrantyDays / 365.25) * 12)
      : coverage.startDate && coverage.expiresOn
        ? monthsBetween(coverage.startDate, coverage.expiresOn)
        : null;
  const usedMonths = coverage.startDate && asOf ? monthsBetween(coverage.startDate, asOf) : null;
  return {
    badge: coverageBadge(coverage.status),
    soldLine: coverage.startDate
      ? `Sold ${formatDate(coverage.startDate)}.${coverage.expiresOn ? ` Expires ${formatDate(coverage.expiresOn)}.` : ""}`
      : "No sale date is recorded for this vehicle.",
    time:
      coverage.daysUsedPercent !== null && usedMonths !== null && totalMonths
        ? { label: `Time used: ${formatYearsMonths(Math.min(usedMonths, totalMonths))} of ${formatYearsMonths(totalMonths)}`, percent: coverage.daysUsedPercent }
        : null,
    distance:
      coverage.kmUsedPercent !== null && coverage.mileage !== null && coverage.kmLimit !== null
        ? { label: `Distance: ${formatQuantity(coverage.mileage)} of ${formatKm(coverage.kmLimit)}`, percent: coverage.kmUsedPercent }
        : null,
  };
}

/** "Service at least every 3 months or 5,000 km, whichever comes first." plus grace when set. */
export function ruleSentence(rule: ServiceRule): string {
  const base = `Service at least every ${plural(rule.intervalMonths, "month")} or ${formatKm(rule.intervalKm)}, whichever comes first.`;
  const grace = [rule.graceDays ? plural(rule.graceDays, "day") : null, rule.graceKm ? formatKm(rule.graceKm) : null].filter(Boolean);
  return grace.length ? `${base} Grace: ${grace.join(" and ")}.` : base;
}

/** "Q1" for quarters, "P1" when the year has another number of periods. */
export const periodLabel = (period: number, perYear: number) => (perYear === 4 ? `Q${period}` : `P${period}`);

export const periodName = (period: number, perYear: number) => (perYear === 4 ? `quarter ${period}` : `period ${period}`);

/** "Year 2", "Mar 2024 to Mar 2025", and "(current)" for the year of this visit. */
export function yearHeading(year: YearRow): { title: string; range: string } {
  const endExclusive = new Date(`${year.end}T12:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return {
    title: year.current ? `Year ${year.year} (current)` : `Year ${year.year}`,
    range: `${formatMonthYear(`${year.start}T12:00:00Z`)} to ${formatMonthYear(endExclusive)}`,
  };
}

/** What a missed block says: "4 months 2 weeks and 6,300 km since the last service". */
export function missedDetail(missed: MissedService): string {
  const since = missed.fromSale ? "since the sale" : "since the last service";
  const km = missed.kmGap !== null ? ` and ${formatKm(missed.kmGap)}` : "";
  if (missed.toDate === null) return `No service for ${formatSpan(missed.gap)}${km} ${since}, by this visit`;
  return `${formatSpan(missed.gap)}${km} ${since}`;
}

/** The lines of one period block, in reading order. */
export function periodLines(row: PeriodRow): { date: string | null; detail: string | null } {
  const service = row.services[row.services.length - 1];
  if (row.status === "MISSED") {
    const missed = row.missed[0];
    return { date: service ? formatDate(service.date) : null, detail: missedDetail(missed) };
  }
  if (service) {
    const where = service.source === "OUTSIDE" ? `, at ${service.label}` : "";
    const km = service.kmSinceLast !== null ? `${formatKm(service.kmSinceLast)} since last service` : "km not recorded";
    return { date: formatDate(service.date), detail: `${km}${where}` };
  }
  if (row.dueOn) return { date: `Due ${formatDate(row.dueOn)}`, detail: null };
  return { date: null, detail: null };
}

/** Accessible name for a block: "Year 2, quarter 2: Missed. 4 months 2 weeks ...". */
export function periodAria(year: number, row: PeriodRow, perYear: number): string {
  const lines = periodLines(row);
  return [`Year ${year}, ${periodName(row.period, perYear)}: ${PERIOD_STATUS[row.status].label}.`, lines.date, lines.detail].filter(Boolean).join(" ");
}

/** Why a payer cannot be chosen for an item, or null when it can. Mirrors the server's line rules. */
export function payerBlock(
  payer: FindingPayer,
  item: Pick<DecisionItem, "kind" | "partWarrantyApplicable">,
  check: Pick<JobWarrantyCheck, "coverage" | "warrantyCase" | "campaigns">,
): string | null {
  if (payer === "WARRANTY") {
    if (item.kind !== "LABOUR" && item.partWarrantyApplicable === false) return "This part cannot be claimed under warranty.";
    if (check.coverage.atOpening !== "ACTIVE" && !check.warrantyCase)
      return "Not in warranty when the job opened. Open a warranty case from the Warranty menu first, or choose goodwill.";
  }
  if (payer === "CAMPAIGN" && !check.campaigns.length) return "No campaign is linked to this job.";
  return null;
}

/** The campaign that pays for a campaign item when the job has one; with more, the officer chooses. */
export const defaultCampaign = (campaigns: LinkedCampaign[]) => (campaigns.length === 1 ? campaigns[0].id : null);

export const REASON_LABEL = "Reason";
export const REASON_HINT = "Needed because the service history is not regular and items are set to warranty or goodwill.";
export const REASON_MAX = 1000;

/** The line under the handoff button. */
export const handoffNote = (advisor: string | null | undefined) =>
  `${advisor?.trim() || "The service advisor"} will prepare the estimate.`;

/** Counts for the read-only summary and the items card: "2 of 7 decided". */
export function decidedCount(items: Pick<DecisionItem, "payer">[]) {
  const decided = items.filter((item) => item.payer).length;
  return { decided, total: items.length, label: `${decided} of ${items.length} decided` };
}

// ── Outside service record form ──────────────────────────────────────────────

export interface OutsideRecordForm {
  serviceDate: string;
  mileage: string;
  dealerName: string;
  note: string;
  image: string | null;
}

export type OutsideRecordProblems = Partial<Record<keyof OutsideRecordForm, string>>;

/** Field problems for the outside record dialog. `today` and the sale date are YYYY-MM-DD. */
export function outsideRecordProblems(form: OutsideRecordForm, today: string, saleDate: string | null): OutsideRecordProblems {
  const problems: OutsideRecordProblems = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.serviceDate)) problems.serviceDate = "Enter the service date";
  else if (form.serviceDate > today) problems.serviceDate = "The service date cannot be in the future";
  else if (saleDate && form.serviceDate < saleDate) problems.serviceDate = "The service date is before the vehicle was sold";
  const km = form.mileage.replace(/,/g, "").trim();
  if (!km) problems.mileage = "Enter the km reading from the service book";
  else if (!/^\d+$/.test(km)) problems.mileage = "Enter the km reading as a whole number";
  else if (Number(km) > 2_000_000) problems.mileage = "Check the km reading. It is too high";
  if (form.dealerName.trim().length < 2) problems.dealerName = "Enter the dealer that did the service";
  if (form.note.trim().length > 500) problems.note = "Keep the note under 500 characters";
  if (!form.image) problems.image = "Add a photo of the stamped service book page";
  return problems;
}

/** Today's date in Lagos as YYYY-MM-DD, for the date field's limit. */
export function lagosToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 3_600_000).toISOString().slice(0, 10);
}

/** The check-in alert from the service history verdict (phase 4), or null when there is nothing to say. */
export function serviceHistoryAlert(
  note: { verdict: ServiceVerdict["kind"]; sentence: string } | null | undefined,
  inWarranty: boolean,
): string | null {
  if (!note || !inWarranty || note.verdict !== "IRREGULAR") return null;
  return `${note.sentence} Warranty items will need the warranty officer's review.`;
}

export const recordLine = (record: { serviceDate: string; mileage: number; dealerName: string }) =>
  `${formatDate(record.serviceDate)}, ${formatKm(record.mileage)}, ${record.dealerName}`;

