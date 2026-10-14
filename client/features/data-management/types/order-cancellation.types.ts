/** A line still to bill or supply, as the cancellation screens list it (legacy "Fill Orders"). */
export type PendingLine = {
  id: string;
  partNumber: string;
  description: string;
  ordered: number;
  /** What cancelling the line would take off: still to bill (CPO) or to supply (indent). */
  pending: number;
  /** Reserved for the line now; cancelling releases it. */
  picked: number;
};

export type PendingOrder = {
  id: string;
  number: string;
  date: string;
  status: string;
  /** The customer (CPO) or the other branch (indent). */
  party: string;
  lines: PendingLine[];
};

export type PendingOrderFilters = {
  branchId: string;
  /** Customer (CPO) or other branch (indent). */
  partyId?: string;
  from?: string;
  to?: string;
  search?: string;
};

export type CancelLinesResult = {
  units: number;
  documents: { id: string; number: string; status: string }[];
};
