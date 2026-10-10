/** Filters and helpers shared by the parts and stock report services. */
import { Prisma } from "@prisma/client";
import { reportEnd, reportStart } from "../finance/party-report";

export interface ReportFilters {
  from: string;
  to: string;
  /** The branch the report is for; undefined means every branch (cross-branch users only). */
  branchId?: string;
  customerId?: string;
  /** Vendor name on MITs and vendor MRNs. */
  vendor?: string;
  executiveId?: string;
  /** The other branch: receiving branch for STNs, requesting branch for inward indents, supplying
   * branch for outward indents and in-transit STNs, sending branch for SRNs. */
  otherBranchId?: string;
  partId?: string;
  /** With `partId`: the part's main part and all its alternates. */
  includeAlternates?: boolean;
  partFlag?: string;
  priceCategory?: string;
  search?: string;
  status?: string;
  option?: string;
  fullyExecuted?: boolean;
  includeReturns?: boolean;
  includeCancelled?: boolean;
  /** Stock reports: only parts with a movement in the period. */
  onlyTransacted?: boolean;
  /** Slow-moving items: not issued for this many days. */
  days?: number;
  /** Stock ageing: five increasing age limits in days. */
  ageLimits?: number[];
}

export type Row = Record<string, string | number | null>;

/** Lagos calendar days from `from` to the end of `to`. */
export function dateRange(f: Pick<ReportFilters, "from" | "to">) {
  return { gte: reportStart(f.from), lt: reportEnd(f.to) };
}

export function partWhere(f: ReportFilters): Prisma.SparePartWhereInput {
  return {
    ...(f.partId && { id: f.partId }),
    ...(f.partFlag && { partFlag: f.partFlag }),
    ...(f.priceCategory && { priceCategoryCode: f.priceCategory }),
  };
}

export const userName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : "");
export const partyName = (c: { companyName: string | null; firstName: string; lastName: string }) =>
  c.companyName || `${c.firstName} ${c.lastName}`.trim();
