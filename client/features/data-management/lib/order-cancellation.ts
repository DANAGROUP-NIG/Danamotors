import { INVENTORY_PERMISSIONS, PART_SALE_PERMISSIONS } from "@/features/auth/roles";

/**
 * The three legacy Data Management cancellation screens share one page. Each kind says what is
 * cancelled, whose orders they are and where the documents live.
 */
export const CANCELLATION_KINDS = {
  "cpo-cancellation": {
    title: "Customer Purchase Order Cancellation",
    description: "Cancel what is still to bill on customer purchase orders. Picked stock on a cancelled line goes back to free stock.",
    document: "CPO",
    branchLabel: "Selling branch",
    partyLabel: "Customer",
    pendingLabel: "Pending to bill",
    remarkLabel: "Remark",
    permission: PART_SALE_PERMISSIONS.ORDER,
    // Part sale runs at CPD.
    preferCpd: true,
    href: (id: string) => `/part-sale/orders/${id}`,
  },
  "indent-inward-cancellation": {
    title: "Branch Indent From Other Branch Cancellation",
    description:
      "Cancel what your branch will no longer supply on indents other branches raised on it. Picked stock on a cancelled line goes back to free stock and the requesting branch is told.",
    document: "Indent",
    branchLabel: "Supplying branch",
    partyLabel: "From branch",
    pendingLabel: "Pending to supply",
    remarkLabel: "Reason",
    permission: INVENTORY_PERMISSIONS.TRANSFER_CANCEL,
    // Most indents are raised on CPD.
    preferCpd: true,
    href: (id: string) => `/transfers/indents/${id}`,
  },
  "indent-outward-cancellation": {
    title: "Branch Indent To Other Branch Cancellation",
    description:
      "Cancel what your branch no longer needs on indents it raised on other branches. The supplying branch is told, and any stock it picked for the line is released.",
    document: "Indent",
    branchLabel: "Requesting branch",
    partyLabel: "Supplying branch",
    pendingLabel: "Pending to receive",
    remarkLabel: "Reason",
    permission: INVENTORY_PERMISSIONS.TRANSFER_CANCEL,
    preferCpd: false,
    href: (id: string) => `/transfers/indents/${id}`,
  },
} as const;

export type CancellationKind = keyof typeof CANCELLATION_KINDS;

export const isCancellationKind = (kind: string): kind is CancellationKind => kind in CANCELLATION_KINDS;
