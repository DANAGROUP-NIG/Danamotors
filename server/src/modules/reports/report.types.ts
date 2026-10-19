export type Cell = string | number | null;
export type ReportRow = Record<string, Cell>;
export interface ReportSection {
    title: string;
    rows: ReportRow[];
    totals?: ReportRow;
    pageBreak?: boolean;
    columns?: string[];
    columnGroups?: { title: string; columns: string[] }[];
    columnLabels?: Record<string, string>;
}
export interface ReportResult {
    exportSummary?: boolean;
    summaryKeys?: string[];
    rows: ReportRow[];
    groups: ReportSection[];
    totals: ReportRow;
    filters: Record<string, unknown>;
    columns?: string[];
    columnLabels?: Record<string, string>;
    warnings?: string[];
}
export const REPORT_SLUGS = ['tax-register', 'booked-vs-availed', 'estimate-vs-job', 'unbilled-parts', 'corporate-bills', 'delivered-model', 'delivered-service', 'warranty-attended', 'warranty-parts', 'vehicle-history-card'] as const;
export type ReportSlug = typeof REPORT_SLUGS[number];
