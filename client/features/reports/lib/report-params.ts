import type { FilterKey, ReportConfig } from "../types";
import { daysBetween, isDateString, presetRange } from "./report-dates";

export const MAX_RANGE_DAYS = 366;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Everything a report run depends on. Lives in the URL so a report can be bookmarked. */
export interface ReportParams {
  from: string;
  to: string;
  /** Empty or absent = All. */
  filters: Partial<Record<FilterKey, string[]>>;
  /** Option values as strings ("true"/"false" for checkboxes), plus mode and the date basis. */
  options: Record<string, string>;
  /** Admin / SuperAdmin only: a branch id or ALL. */
  branchId?: string;
}

export function defaultParams(config: ReportConfig): ReportParams {
  const { from, to } = presetRange(config.period.defaultPreset);
  const options: Record<string, string> = {};
  for (const option of config.options ?? []) {
    options[option.key] = option.kind === "checkbox" ? String(Boolean(option.default)) : String(option.default);
  }
  if (config.hasMode) options.mode = "both";
  if (config.period.basis) options[config.period.basis.key] = config.period.basis.default;
  return { from, to: config.period.kind === "date" ? from : to, filters: {}, options };
}

/**
 * Applied params from the URL, or null when the report has not been run yet. Anything
 * malformed in a hand-edited URL falls back to the default instead of failing the request.
 */
export function parseParams(config: ReportConfig, search: URLSearchParams): ReportParams | null {
  const isRange = config.period.kind === "range";
  const from = search.get(isRange ? "from" : "date");
  const to = isRange ? search.get("to") : from;
  if (!isDateString(from) || !isDateString(to)) return null;

  const base = defaultParams(config);
  const filters: ReportParams["filters"] = {};
  for (const key of config.filters) {
    const ids = (search.get(key) ?? "").split(",").filter((id) => UUID.test(id));
    if (ids.length) filters[key] = ids;
  }

  const options = { ...base.options };
  for (const option of config.options ?? []) {
    const raw = search.get(option.key);
    if (raw === null) continue;
    if (option.kind === "checkbox") options[option.key] = String(raw === "true");
    else if (option.kind === "number") {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= option.min && n <= option.max) options[option.key] = String(n);
    } else if (option.choices.some((choice) => choice.value === raw)) options[option.key] = raw;
  }
  const mode = search.get("mode");
  if (config.hasMode && (mode === "both" || mode === "summary" || mode === "detail")) options.mode = mode;
  const basis = config.period.basis;
  const basisValue = basis ? search.get(basis.key) : null;
  if (basis && basisValue && basis.choices.some((choice) => choice.value === basisValue)) options[basis.key] = basisValue;

  const branchId = search.get("branchId");
  return {
    from,
    to,
    filters,
    options,
    branchId: branchId === "ALL" || (branchId && UUID.test(branchId)) ? branchId : undefined,
  };
}

/** The URL query string for applied params. */
export function toSearch(config: ReportConfig, params: ReportParams): string {
  const search = new URLSearchParams();
  if (config.period.kind === "range") {
    search.set("from", params.from);
    search.set("to", params.to);
  } else search.set("date", params.from);
  for (const key of config.filters) if (params.filters[key]?.length) search.set(key, params.filters[key]!.join(","));
  for (const [key, value] of Object.entries(params.options)) search.set(key, value);
  if (params.branchId) search.set("branchId", params.branchId);
  return search.toString();
}

/** Query sent to GET /reports/:slug — display-only options stay on the client. */
export function toApiQuery(config: ReportConfig, params: ReportParams): Record<string, string> {
  const local = new Set((config.options ?? []).filter((option) => option.local).map((option) => option.key));
  const query: Record<string, string> = {};
  if (config.period.kind === "range") {
    query.from = params.from;
    query.to = params.to;
  } else query.date = params.from;
  for (const key of config.filters) if (params.filters[key]?.length) query[key] = params.filters[key]!.join(",");
  for (const [key, value] of Object.entries(params.options)) if (!local.has(key)) query[key] = value;
  if (params.branchId) query.branchId = params.branchId;
  return query;
}

/** Client-side check matching the server's rules, so the user sees the problem before running. */
export function validateParams(config: ReportConfig, params: ReportParams): string | null {
  if (!isDateString(params.from) || !isDateString(params.to)) return "Enter a valid date.";
  if (config.period.kind === "range") {
    const span = daysBetween(params.from, params.to);
    if (span < 0) return "The end date must be on or after the start date.";
    if (span + 1 > MAX_RANGE_DAYS) return `The period cannot be longer than ${MAX_RANGE_DAYS} days.`;
  }
  return null;
}

export function sameParams(config: ReportConfig, a: ReportParams | null, b: ReportParams | null): boolean {
  if (!a || !b) return a === b;
  return toSearch(config, a) === toSearch(config, b);
}
