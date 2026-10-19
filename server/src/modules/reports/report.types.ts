export type Cell = string | number | null;
export type ReportRow = Record<string, Cell>;
export interface ReportSection {
    title: string;
    rows: ReportRow[];
    totals?: ReportRow;
    pageBreak?: boolean;
}
export interface ReportResult {
    rows: ReportRow[];
    groups: ReportSection[];
    totals: ReportRow;
    filters: Record<string, unknown>;
    columns?: string[];
    warnings?: string[];
}
export const REPORT_SLUGS = ['tax-register', 'booked-vs-availed', 'estimate-vs-job', 'unbilled-parts', 'corporate-bills', 'delivered-model', 'delivered-service', 'warranty-attended', 'warranty-parts', 'vehicle-history-card'] as const;
export type ReportSlug = typeof REPORT_SLUGS[number];
