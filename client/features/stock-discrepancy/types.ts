/** Legacy S/E approval: an MIT or STN receipt with damaged or short units waits for approval. */
export type DiscrepancyStatus = "PENDING" | "APPROVED";

type Person = { firstName: string; lastName: string } | null;

/** The approval fields on an MRN, as the MIT and STN pages receive them. */
export type DiscrepancyFields = {
  discrepancyStatus?: DiscrepancyStatus | null;
  discrepancyApprovedAt?: string | null;
  discrepancyRemark?: string | null;
  discrepancyApprovedBy?: Person;
};

export type PendingDiscrepancy = {
  id: string;
  mrnNumber: string;
  source: "MOBIS" | "BRANCH_TRANSFER";
  receiptDate: string;
  totalReceived: number;
  totalDamaged: number;
  totalShort: number;
  mitId: string | null;
  stnId: string | null;
  mit: { mitNumber: string; invoiceNumber: string } | null;
  stn: { stnNumber: string } | null;
  receivingBranch: { id: string; name: string };
  sourceBranch: { id: string; name: string } | null;
  receivedBy: Person;
};

/** Where a receipt is shown: its MIT or its STN page. */
export const receiptLink = (row: Pick<PendingDiscrepancy, "mitId" | "stnId">) =>
  row.mitId ? `/inventory/mit/${row.mitId}` : row.stnId ? `/transfers/stn/${row.stnId}` : "#";
