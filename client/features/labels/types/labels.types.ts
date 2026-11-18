export type LabelPrintStatus = "QUEUED" | "PRINTED" | "FAILED" | "CANCELLED";
export type PrinterStatus = "READY" | "PAUSED" | "PAPER_OUT" | "HEAD_OPEN" | "ERROR";

/** A part found for labelling, with its bin and stock at the printing branch. */
export interface LabelPart {
  id: string;
  partNumber: string;
  name: string;
  priceCategoryCode: string | null;
  bin: string | null;
  stock: number;
}

/** A station PC of the branch and the label printer on its USB (printerModel null: none). */
export interface LabelPrinter {
  id: string;
  name: string;
  online: boolean;
  printerModel: string | null;
  printerStatus: PrinterStatus | null;
  printerDetail: string | null;
}

export interface LabelPrintJob {
  id: string;
  branchId: string;
  labels: { partId: string; partNumber: string; description: string; bin: string | null; copies: number }[];
  labelCount: number;
  status: LabelPrintStatus;
  createdAt: string;
  printedAt: string | null;
  error: string | null;
  requestedBy: { firstName: string; lastName: string } | null;
  printedStation: { name: string } | null;
}
