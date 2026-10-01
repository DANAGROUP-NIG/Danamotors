import type { CampaignType, CaseStatus, CoverageStatus, Person } from "@/features/warranty/types/warranty.types";

/** Who pays for a line. Legacy requisitionpartdetail.warranty: N, W, G, F. */
export type ChargeType = "CUSTOMER" | "WARRANTY" | "GOODWILL" | "FREE";

export type JobCardLine = {
  id: string;
  jobCardId: string;
  kind: "PART" | "LABOUR";
  sparePartId: string | null;
  partIssuanceId: string | null;
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
  invoice: { id: string; invoiceNumber: string; status: string } | null;
  claim: { id: string; caseNumber: string; status: CaseStatus } | null;
  /** Billed on an invoice or on a submitted claim: charge type can no longer change. */
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

export type JobCardLines = {
  lines: JobCardLine[];
  totals: ChargeTotals;
  vatRate: number;
  coverageAtCreation: CoverageStatus | null;
  warrantyCase: { id: string; caseNumber: string; status: CaseStatus } | null;
  linkedCampaigns: { id: string; code: string; title: string; type: CampaignType; partsCovered: boolean; labourCovered: boolean }[];
};

export type LabourLinePayload = {
  operationCode?: string | null;
  description: string;
  hours: number;
  rate: number;
  taxable?: boolean;
  chargeType?: ChargeType;
  campaignId?: string | null;
  reason?: string | null;
};

export type UpdateLinePayload = Partial<LabourLinePayload>;
