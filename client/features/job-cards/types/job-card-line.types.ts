import type { CampaignType, CaseStatus, CoverageStatus, Person } from "@/features/warranty/types/warranty.types";

/** Who pays for a line. Legacy requisitionpartdetail.warranty: N, W, G, F. */
export type ChargeType = "CUSTOMER" | "WARRANTY" | "GOODWILL" | "FREE";

export type JobCardLine = {
  id: string;
  jobCardId: string;
  kind: "PART" | "LABOUR";
  sparePartId: string | null;
  /** Set for part lines: the stock issuance this line prices. */
  partIssuanceId: string | null;
  /** Set for labour lines: the job card labour line this line prices. */
  jobCardLabourId: string | null;
  operationCode: string | null;
  description: string;
  /** Quantity for parts, hours for labour. */
  quantity: number;
  rate: number;
  amount: number;
  taxable: boolean;
  chargeType: ChargeType;
  campaignId: string | null;
  chargeTypeReason: string | null;
  chargeTypeChangedAt: string | null;
  chargeTypeChangedBy: Person | null;
  sparePart: { id: string; partNumber: string; name: string; warrantyApplicable: boolean } | null;
  campaign: { id: string; code: string; title: string; type: CampaignType } | null;
  /** The job card's bill, once billed. */
  invoice: JobCardBill | null;
  claim: { id: string; caseNumber: string; status: CaseStatus } | null;
  /** The job card is billed, or the line is on a submitted claim: who pays can no longer change. */
  locked: boolean;
};

export type ChargeTotals = {
  customer: number;
  warranty: number;
  goodwill: number;
  free: number;
  customerTax: number;
  customerInvoiceTotal: number;
};

export type JobCardBill = { id: string; invoiceNumber: string; status: string };

export type JobCardLines = {
  lines: JobCardLine[];
  totals: ChargeTotals;
  /** VAT as a fraction, e.g. 0.075. */
  vatRate: number;
  bill: JobCardBill | null;
  coverageAtCreation: CoverageStatus | null;
  warrantyCase: { id: string; caseNumber: string; status: CaseStatus } | null;
  linkedCampaigns: { id: string; code: string; title: string; type: CampaignType; partsCovered: boolean; labourCovered: boolean }[];
};

export type UpdateLinePayload = {
  chargeType?: ChargeType;
  campaignId?: string | null;
  reason?: string | null;
};
