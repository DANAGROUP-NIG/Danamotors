import type { Prisma } from '@prisma/client';
import type { z } from 'zod';

export type ReportDb = Prisma.TransactionClient;

/** Dimension filters shared by the report screens. Query parameter names match these keys. */
export type FilterKey =
  | 'model'
  | 'variant'
  | 'serviceType'
  | 'team'
  | 'receivedBy'
  | 'deliveredBy'
  | 'technician'
  | 'complaint'
  | 'labourOperation';

export type DimensionFilters = Partial<Record<FilterKey, string[]>>;

export type ReportMode = 'both' | 'summary' | 'detail';

export interface ReportBranch {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phoneNumber: string | null;
}

export interface ReportScope {
  /** null = every branch (Admin and SuperAdmin only). */
  branchIds: string[] | null;
  /** The single branch being reported on, or null for all branches. */
  branch: ReportBranch | null;
  timeZone: string;
}

export type ReportRow = Record<string, unknown>;

export interface ReportGroup {
  key: string;
  label: string;
  count: number;
  totals: Record<string, number>;
}

/** What a report's run() returns; the controller adds report, filters and meta. */
export interface ReportBody<Row extends ReportRow = ReportRow> {
  rows: Row[];
  groups: ReportGroup[];
  totals: Record<string, number>;
  /** Headline counts and amounts for the summary cards. */
  summary?: Record<string, number | string | null>;
  /** Labelled counts for summary chips (e.g. jobs by service type). */
  breakdown?: BreakdownItem[];
  truncated?: boolean;
}

export interface BreakdownItem {
  key: string;
  label: string;
  count: number;
  amount?: number;
}

export interface AppliedFilter {
  key: string;
  label: string;
  /** Empty = All. */
  values: string[];
}

export interface ReportResponse<Row extends ReportRow = ReportRow> extends ReportBody<Row> {
  report: { slug: string; title: string; width: 80 | 132; generatedAt: string };
  filters: { query: Record<string, unknown>; applied: AppliedFilter[] };
  meta: { rowCount: number; truncated: boolean; branch: ReportBranch | 'ALL'; timeZone: string };
}

export interface ReportParamDoc {
  name: string;
  description: string;
  required?: boolean;
  schema: Record<string, unknown>;
}

export interface ReportDefinition<Q extends { branchId?: string; mode?: ReportMode } = any> {
  slug: string;
  title: string;
  width: 80 | 132;
  permission: string;
  summary: string;
  /** 'range' takes from/to, 'date' takes a single date. */
  period: 'range' | 'date';
  /** Zod schema for req.query. */
  query: z.ZodType<Q, z.ZodTypeDef, unknown>;
  filterKeys: FilterKey[];
  /** Report-specific query parameters for the API docs (shared ones are added automatically). */
  params?: ReportParamDoc[];
  example?: Record<string, unknown>;
  run(db: ReportDb, scope: ReportScope, query: Q): Promise<ReportBody>;
}
