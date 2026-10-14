/**
 * Parts reports (legacy Parts module report menu). One definition per report: the screen
 * renders its filters and columns from here, and the service builds its rows.
 */
import { PERMISSIONS } from "../../shared/constants/roles";
import { DEFAULT_MILEAGE_LIMITS, ReportFilters } from "./partsReport.common";
import { bandLabels, DEFAULT_AGE_LIMITS } from "./stockReport.logic";
import { BIN_LIMIT } from "../stock-take/stockTake.logic";

export type ColumnType = "text" | "date" | "datetime" | "qty" | "money" | "percent";

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
  /** Summed into the report total and each group subtotal. "last" (running balances): each group
   * shows its last line's value, and the report total adds up those closing values. */
  total?: boolean | "last";
  /** Percent columns: the total and subtotals are `of` over the sum of `over`, from their totals. */
  ratio?: { of: string; over: string[] };
}

export type ReportFilterKey =
  | "customer"
  | "vendor"
  | "executive"
  | "branch"
  | "part"
  | "partType"
  | "partFlag"
  | "priceCategory"
  | "search"
  | "status"
  | "option"
  | "fullyExecuted"
  | "includeReturns"
  | "includeCancelled"
  | "includeAlternates"
  | "onlyTransacted"
  | "days"
  | "ageLimits"
  | "mileageLimits"
  | "topN"
  | "summary"
  | "countType"
  | "onlyRemarks"
  | "includeNotRequired";

/**
 * The legacy Parts report menus, in menu order. Transfers (on legacy, part of Part sales) and stock
 * taking and audit (legacy "Physical Stock and Stock Audit MIS") are their own groups.
 */
export const REPORT_GROUPS = ["Part sales", "Part purchase", "Transfers", "Stock", "Stock taking & audit", "MIS"] as const;

export interface ReportDefinition {
  kind: string;
  title: string;
  /** The legacy Parts report menus. */
  group: (typeof REPORT_GROUPS)[number];
  description: string;
  permission: string;
  filters: ReportFilterKey[];
  /** The dates asked for: a range (default), one as-on date (sent as `to`), or none (today's stock). */
  period?: "range" | "asOn" | "none";
  /** Covers every branch; the branch filter does not apply. */
  allBranches?: boolean;
  /** Labels for the `branch` (the other branch), `search` (document number), `option`, `days` and `countType` filters. */
  labels?: { branch?: string; search?: string; option?: string; days?: string; countType?: string };
  /** Choices for the `option` filter (legacy radio buttons). The first is the default. */
  options?: { value: string; label: string }[];
  /** Choices for the `status` filter. */
  statuses?: { value: string; label: string }[];
  /** Choices for the `countType` filter: the stock taking type, or the audit type. */
  countTypes?: { value: string; label: string }[];
  /** Rows carry a `group` value; the screen shows a heading and subtotal per group. */
  grouped?: boolean;
  /** Printed and exported in pages that end with the running grand total (legacy "Carried Forward"). */
  carriedForward?: boolean;
  columns: ReportColumn[] | Record<string, ReportColumn[]>;
  /** With the `summary` filter ticked: these columns instead. */
  summaryColumns?: ReportColumn[];
}

const money = (key: string, label: string, total = true): ReportColumn => ({ key, label, type: "money", total });
const qty = (key: string, label: string, total = true): ReportColumn => ({ key, label, type: "qty", total });
const text = (key: string, label: string): ReportColumn => ({ key, label, type: "text" });
const date = (key = "date", label = "Date"): ReportColumn => ({ key, label, type: "date" });
const datetime = (key: string, label: string): ReportColumn => ({ key, label, type: "datetime" });
const percent = (key: string, label: string, of: string, ...over: string[]): ReportColumn => ({ key, label, type: "percent", ratio: { of, over } });
const balance = (key: string, label: string, type: "qty" | "money"): ReportColumn => ({ key, label, type, total: "last" });

const PART_FILTERS: ReportFilterKey[] = ["part", "partType", "partFlag", "priceCategory"];
const STOCK_PART_FILTERS: ReportFilterKey[] = ["part", "includeAlternates", "partType", "partFlag", "priceCategory"];
const FIFO_FIRST = [
  { value: "FIFO", label: "FIFO" },
  { value: "DEALER", label: "Dealer rate" },
];
const DEALER_FIRST = [FIFO_FIRST[1], FIFO_FIRST[0]];
const BASED_ON = { option: "Based on" };
const PART_COLUMNS: ReportColumn[] = [text("partNumber", "Part Number"), text("description", "Description"), text("category", "Category")];
/** Physical stock taking: the part as counted, valued at dealer rate. */
const COUNT_PART_COLUMNS: ReportColumn[] = [
  text("partNumber", "Part Number"),
  text("flag", "Flag"),
  text("description", "Description"),
  text("bin", "Bin"),
  money("rate", "Dealer rate", false),
];
const CATEGORY_COLUMNS: ReportColumn[] = [text("category", "Category"), text("categoryName", "Description")];
/** Consumption Report (legacy Consumption Report (Consolidated)): issues by kind, net of returns, at retail rate, in the legacy order. */
const CONSUMPTION_COLUMNS: ReportColumn[] = [
  qty("pdi", "PDI req qty"),
  qty("job", "Job order issues qty"),
  money("jobAmount", "Job order issues amount"),
  qty("foc", "FOC issues"),
  qty("goodwill", "Goodwill issues"),
  qty("pdiWarranty", "PDI warr qty"),
  qty("warranty", "Warr req qty"),
  qty("counterSale", "Counter sale qty"),
  money("counterSaleAmount", "Counter sale amount"),
  qty("consumable", "Consumable issue qty"),
  qty("samples", "Samples qty"),
  qty("stn", "STN qty"),
  qty("san", "SAN qty (not in total)"),
  qty("quantity", "Total issues qty"),
  money("value", "Total issues amount"),
];
const PROFIT_COLUMNS: ReportColumn[] = [
  qty("quantity", "Qty"),
  money("sales", "Sale value"),
  money("cost", "Cost"),
  money("margin", "Profit"),
  percent("marginPercent", "Profit %", "margin", "sales"),
];
const ORDER_STATUSES = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "EXECUTED", label: "Executed" },
];
const PENDING_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
];
const RECEIPT_QTY: ReportColumn[] = [qty("received", "Received"), qty("damaged", "Damaged"), qty("short", "Short")];
/** Legacy STN/SRN Register columns; the flag prints between the part number and description. */
const STN_COLUMNS: ReportColumn[] = [
  text("stnNumber", "Bill Number"),
  date(),
  text("toBranch", "Store"),
  text("partNumber", "Part No"),
  text("partFlag", "Flag"),
  text("description", "Description"),
  qty("quantity", "Qty"),
  money("rate", "Rate", false),
  money("amount", "Amount"),
];

/**
 * Physical stock taking and stock audit reports (legacy Physical Stock Taking and Stock Audit MIS
 * menus). Both read the same rows (stockTake.report.ts), filtered by kind; on audits the checker is
 * the auditor.
 */
function countColumns(audit: boolean): Record<string, ReportColumn[]> {
  const batch = text("batch", audit ? "Audit No" : "Batch No");
  const by = text("checker", audit ? "Auditor" : "Checker");
  const remarks = text("remarks", "Remarks");
  const counted: ReportColumn[] = [qty("systemQuantity", "System qty"), qty("physicalQuantity", "Physical qty")];
  const discrepancy: ReportColumn[] = [
    qty("excessQuantity", "Excess qty"),
    money("excessValue", "Excess value"),
    qty("shortageQuantity", "Shortage qty"),
    money("shortageValue", "Shortage value"),
  ];
  const line = [batch, ...COUNT_PART_COLUMNS];
  return {
    DISCREPANCY: [...line, ...counted, ...discrepancy, by, remarks],
    PART: [
      ...line,
      qty("systemQuantity", "System qty"),
      money("systemValue", "System value"),
      qty("physicalQuantity", "Physical qty"),
      money("physicalValue", "Physical value"),
      qty("damagedQuantity", "Damaged qty"),
      qty("excessQuantity", "Excess qty"),
      qty("shortageQuantity", "Shortage qty"),
      by,
      remarks,
    ],
    // Grouped by remark (legacy Remarks Wise Stock Audit Report) or by checker (Checker Detail).
    REMARKS: [...line, ...counted, ...discrepancy, by],
    CHECKER: [...line, ...counted, ...discrepancy, remarks],
    // Grouped by part: every count of it in the period (legacy Stock Audit History).
    HISTORY: [
      batch,
      datetime("date", "Counted"),
      text("type", audit ? "Audit type" : "Type"),
      text("bin", "Bin"),
      money("rate", "Dealer rate", false),
      ...counted,
      ...discrepancy,
      by,
      remarks,
    ],
    BIN: [
      datetime("date", "Counted"),
      text("partNumber", "Part Number"),
      text("flag", "Flag"),
      text("description", "Description"),
      qty("physicalQuantity", "Physical qty"),
      qty("damagedQuantity", "Damaged qty"),
      by,
    ],
    DAMAGE: [...line, qty("physicalQuantity", "Physical qty"), qty("damagedQuantity", "Damaged qty"), money("damagedValue", "Damaged value"), by, remarks],
    // One line per count (legacy Summary). All branches gives every branch together (Combined Summary).
    SUMMARY: [
      batch,
      date(),
      text("type", audit ? "Audit type" : "Type"),
      text("status", "Status"),
      qty("parts", "Parts"),
      qty("countedParts", "Counted"),
      money("systemValue", "System value"),
      money("physicalValue", "Physical value"),
      money("damagedValue", "Damaged value"),
      money("excessValue", "Excess value"),
      money("shortageValue", "Shortage value"),
      money("netValue", "Net excess / (shortage)"),
      audit ? text("auditors", "Auditor(s)") : text("confirmedBy", "S/E approved by"),
      audit ? datetime("closedAt", "Completed") : datetime("closedAt", "S/E approved"),
    ],
    // Legacy List of Not Defined Parts (wrong part).
    NOT_DEFINED: [
      batch,
      datetime("date", "Counted"),
      text("partNumber", "Part Number (as counted)"),
      text("bin", "Found in"),
      qty("physicalQuantity", "Physical qty"),
      qty("damagedQuantity", "Damaged qty"),
      text("status", "Status"),
      by,
      remarks,
    ],
    // Legacy List of Batch Parts Not Uploaded.
    NOT_COUNTED: [...line, qty("systemQuantity", "System qty"), text("sheet", "Count sheet"), by],
    // Legacy Parts Having Bin Location Exceeds Defined Limit: the bins found will not fit one bin.
    BIN_LIMIT: [
      batch,
      text("partNumber", "Part Number"),
      text("flag", "Flag"),
      text("description", "Description"),
      text("recordedBin", "Bin on record"),
      text("bin", "Found in"),
      qty("binCount", "Bins", false),
      qty("binLength", "Characters", false),
    ],
  };
}

const COUNT_OPTIONS: Record<string, string> = {
  DISCREPANCY: "Shortage / excess",
  PART: "Part wise",
  REMARKS: "Remarks wise",
  HISTORY: "Audit history (part wise)",
  BIN: "Bin location wise",
  DAMAGE: "Damaged parts",
  CHECKER: "Checker wise",
  SUMMARY: "Summary",
  NOT_DEFINED: "Part numbers not in Part Master",
  NOT_COUNTED: "Parts not counted yet",
  BIN_LIMIT: `Bins over ${BIN_LIMIT} characters`,
};
const countOptions = (keys: string[], labels: Record<string, string> = {}) => keys.map((value) => ({ value, label: labels[value] ?? COUNT_OPTIONS[value] }));
const COUNT_FILTERS: ReportFilterKey[] = ["countType", "search", ...PART_FILTERS, "option", "onlyRemarks", "includeNotRequired"];
const ALL = { value: "", label: "All" };

const PHYSICAL_STOCK: ReportDefinition = {
  kind: "physical-stock",
  title: "Physical Stock Taking",
  group: "Stock taking & audit",
  description: "Counted against system stock, with shortage and excess at dealer rate. Give a batch number for one count, else counts created in the period.",
  permission: PERMISSIONS.STOCK_TAKE_READ,
  filters: COUNT_FILTERS,
  labels: { search: "Batch no. (optional)", option: "Show", countType: "Stock taking" },
  countTypes: [ALL, { value: "ANNUAL", label: "Annual" }, { value: "PERPETUAL", label: "Perpetual" }],
  options: countOptions(["DISCREPANCY", "PART", "BIN", "DAMAGE", "CHECKER", "SUMMARY", "NOT_DEFINED", "NOT_COUNTED", "BIN_LIMIT"]),
  grouped: true,
  columns: countColumns(false),
};

const STOCK_AUDIT: ReportDefinition = {
  ...PHYSICAL_STOCK,
  kind: "stock-audit",
  title: "Stock Audit",
  description: "Audited against system stock, with shortage and excess at dealer rate. Audits never adjust stock. Give an audit number for one audit, else audits created in the period.",
  permission: PERMISSIONS.STOCK_AUDIT_READ,
  labels: { search: "Audit no. (optional)", option: "Show", countType: "Audit type" },
  countTypes: [
    ALL,
    { value: "INTERNAL", label: "Internal audit" },
    { value: "AUDIT_HEAD", label: "Audit by audit head" },
    { value: "VISITING_MANAGEMENT", label: "Audit by visiting management" },
  ],
  // Audits never update bins, so the bin limit does not apply.
  options: countOptions(["DISCREPANCY", "PART", "REMARKS", "HISTORY", "BIN", "DAMAGE", "CHECKER", "SUMMARY", "NOT_DEFINED", "NOT_COUNTED"], {
    CHECKER: "Auditor wise",
  }),
  columns: countColumns(true),
};

/** Stock Taking Log and Stock Audit Log: count sheets issued, uploaded and cancelled, and counts corrected. */
const STOCK_TAKE_LOG: ReportDefinition = {
  kind: "stock-take-log",
  title: "Stock Taking Log",
  group: "Stock taking & audit",
  description: "Count sheets issued, uploaded and cancelled, and every count corrected or added on screen, with who did it and when.",
  permission: PERMISSIONS.STOCK_TAKE_READ,
  filters: ["countType", "search", "option"],
  labels: PHYSICAL_STOCK.labels,
  countTypes: PHYSICAL_STOCK.countTypes,
  options: [
    { value: "SHEETS", label: "Count sheets" },
    { value: "CORRECTIONS", label: "Corrections and added counts" },
  ],
  columns: {
    SHEETS: [
      text("batch", "Batch No"),
      text("sheetNumber", "Sheet No"),
      datetime("issuedAt", "Issued"),
      text("issuedBy", "Issued by"),
      text("checker", "Checker"),
      text("criteria", "Selection"),
      qty("parts", "Parts"),
      qty("countedParts", "Counted"),
      text("status", "Status"),
      datetime("closedAt", "Uploaded / cancelled"),
      text("closedBy", "Uploaded by"),
      text("remarks", "Cancel remarks"),
    ],
    CORRECTIONS: [
      text("batch", "Batch No"),
      datetime("date", "Corrected"),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      text("entry", "Entry"),
      qty("quantity", "Qty change"),
      qty("damagedQuantity", "Damaged change"),
      text("remarks", "Remarks"),
      text("by", "Corrected by"),
    ],
  },
};

const STOCK_AUDIT_LOG: ReportDefinition = {
  ...STOCK_TAKE_LOG,
  kind: "stock-audit-log",
  title: "Stock Audit Log",
  description: "Audit sheets issued, uploaded and cancelled, and every audit count corrected or added on screen, with who did it and when.",
  permission: PERMISSIONS.STOCK_AUDIT_READ,
  labels: STOCK_AUDIT.labels,
  countTypes: STOCK_AUDIT.countTypes,
};

export const REPORTS: ReportDefinition[] = [
  // ── Part sales: counter sales ──
  {
    kind: "counter-sales",
    title: "Counter Sales Register",
    group: "Part sales",
    description: "Every counter-sale bill line: part, quantity, rate, cash discount, VAT and net value.",
    permission: PERMISSIONS.PART_SALE_READ,
    filters: ["customer", ...PART_FILTERS],
    columns: [
      text("billNumber", "Bill No"),
      date(),
      text("customerCode", "Code"),
      text("customer", "Customer"),
      text("cpoNumber", "CPO"),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      qty("quantity", "Qty"),
      money("rate", "Rate", false),
      money("gross", "Gross"),
      money("discount", "Discount"),
      money("vat", "VAT"),
      money("net", "Net"),
    ],
  },
  {
    kind: "counter-sales-summary",
    title: "Counter Sales Register Summary",
    group: "Part sales",
    description: "One line per bill with its totals, round-off and what is still outstanding.",
    permission: PERMISSIONS.PART_SALE_READ,
    filters: ["customer"],
    columns: [
      text("billNumber", "Bill No"),
      date(),
      text("customer", "Customer"),
      qty("lines", "Lines"),
      qty("quantity", "Qty"),
      money("gross", "Gross"),
      money("discount", "Discount"),
      money("vat", "VAT"),
      money("roundOff", "Round off"),
      money("net", "Net"),
      money("outstanding", "Outstanding"),
      text("status", "Status"),
    ],
  },
  {
    kind: "counter-sales-tax-datewise",
    title: "Counter Sales Tax Register (Datewise)",
    group: "Part sales",
    description: "Day totals of taxable and exempt sales and VAT.",
    permission: PERMISSIONS.PART_SALE_READ,
    filters: [],
    columns: [
      date(),
      qty("bills", "Bills"),
      money("gross", "Gross"),
      money("discount", "Discount"),
      money("taxable", "Taxable value"),
      money("exempt", "Exempt value"),
      money("vat", "VAT"),
      money("roundOff", "Round off"),
      money("net", "Net"),
    ],
  },
  {
    kind: "counter-sales-tax-annexure",
    title: "Counter Sales Tax Register (Annexure)",
    group: "Part sales",
    description: "Bill-wise VAT annexure with customer address. Cancelled bills can be listed but are not totalled.",
    permission: PERMISSIONS.PART_SALE_READ,
    filters: ["includeCancelled"],
    columns: [
      text("billNumber", "Bill No"),
      date(),
      text("customerCode", "Code"),
      text("customer", "Customer"),
      text("address", "Address"),
      money("taxable", "Taxable value"),
      money("exempt", "Exempt value"),
      money("vat", "VAT"),
      money("net", "Net"),
      text("status", "Status"),
    ],
  },
  {
    kind: "counter-sales-returns",
    title: "Counter Sales Return Register",
    group: "Part sales",
    description: "Parts returned against counter-sale bills, at the bill's discount and VAT.",
    permission: PERMISSIONS.PART_SALE_READ,
    filters: ["customer", ...PART_FILTERS],
    columns: [
      text("returnNumber", "Return No"),
      date(),
      text("billNumber", "Bill No"),
      text("customer", "Customer"),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      qty("quantity", "Qty"),
      money("rate", "Rate", false),
      money("gross", "Gross"),
      money("discount", "Discount"),
      money("vat", "VAT"),
      money("net", "Credit"),
      text("creditNote", "Credit note"),
    ],
  },
  {
    kind: "counter-sales-cancellations",
    title: "Counter Sales Cancellation Register",
    group: "Part sales",
    description: "Cancelled counter-sale bills. FOC bills are those with a 100% cash discount.",
    permission: PERMISSIONS.PART_SALE_READ,
    filters: ["option"],
    options: [
      { value: "ALL", label: "All" },
      { value: "COUNTER_SALE", label: "Counter sales" },
      { value: "FOC", label: "FOC" },
    ],
    columns: [
      text("billNumber", "Bill No"),
      date(),
      text("customer", "Customer"),
      text("type", "Type"),
      money("gross", "Gross"),
      money("net", "Net"),
      date("cancelledOn", "Cancelled on"),
      text("cancelledBy", "Cancelled by"),
      text("remark", "Reason"),
    ],
  },
  {
    kind: "counter-sales-revenue",
    title: "Counter Sale Revenue",
    group: "Part sales",
    description: "Sales less returns by price category, against dealer cost, with the margin.",
    permission: PERMISSIONS.PART_SALE_READ,
    filters: ["option"],
    options: [
      { value: "CATEGORY", label: "By category" },
      { value: "CUSTOMER", label: "With customer details" },
    ],
    grouped: true,
    columns: [
      text("category", "Category"),
      text("categoryName", "Description"),
      qty("quantity", "Qty sold"),
      money("sales", "Sales value"),
      money("returns", "Returns"),
      money("netSales", "Net sales"),
      money("cost", "Dealer cost"),
      money("margin", "Margin"),
      percent("marginPercent", "Margin %", "margin", "netSales"),
    ],
  },
  {
    kind: "sales-executive-register",
    title: "Sales Executive Wise Counter Sales Register",
    group: "Part sales",
    description: "Counter-sale bills grouped by sales executive, with subtotals.",
    permission: PERMISSIONS.PART_SALE_READ,
    filters: ["executive"],
    grouped: true,
    columns: [
      text("billNumber", "Bill No"),
      date(),
      text("customer", "Customer"),
      money("gross", "Gross"),
      money("discount", "Discount"),
      money("vat", "VAT"),
      money("net", "Net"),
    ],
  },

  // ── Part sales: customer orders ──
  {
    kind: "cpo-register",
    title: "CPO Register",
    group: "Part sales",
    description: "Customer purchase order lines with what was picked, billed, cancelled and is still pending.",
    permission: PERMISSIONS.PART_SALE_READ,
    filters: ["customer", "search", ...PART_FILTERS, "status", "fullyExecuted"],
    labels: { search: "CPO no. (optional)" },
    statuses: ORDER_STATUSES,
    columns: [
      text("cpoNumber", "CPO No"),
      date(),
      text("customer", "Customer"),
      text("reference", "Customer ref."),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      qty("ordered", "Ordered"),
      qty("picked", "Picked"),
      qty("billed", "Billed"),
      qty("cancelled", "Cancelled"),
      qty("pending", "Pending"),
      money("rate", "Rate", false),
      money("value", "Order value"),
      text("status", "Status"),
    ],
  },

  // ── Part purchase ──
  {
    kind: "mrn-register",
    title: "MRN Register",
    group: "Part purchase",
    description: "Stock received from vendors (Mobis MRNs), line by line by vendor, or one line per supplier invoice.",
    permission: PERMISSIONS.STOCK_READ,
    filters: ["vendor", "search", ...PART_FILTERS, "option"],
    labels: { search: "MRN no. (optional)" },
    options: [
      { value: "VENDOR", label: "Vendor wise" },
      { value: "SUMMARY", label: "Summary (invoice wise)" },
    ],
    grouped: true,
    columns: {
      VENDOR: [
        text("mrnNumber", "MRN No"),
        date(),
        text("invoiceNumber", "Invoice No"),
        text("mitNumber", "MIT No"),
        text("partNumber", "Part Number"),
        text("description", "Description"),
        ...RECEIPT_QTY,
        money("unitPrice", "Invoice price", false),
        money("rate", "Rate (₦)", false),
        money("value", "Value"),
      ],
      SUMMARY: [
        text("mrnNumber", "MRN No"),
        date(),
        text("vendor", "Vendor"),
        text("invoiceNumber", "Invoice No"),
        date("invoiceDate", "Invoice date"),
        text("mitNumber", "MIT No"),
        qty("lines", "Lines"),
        ...RECEIPT_QTY,
        money("value", "Value"),
      ],
    },
  },
  {
    kind: "mit-register",
    title: "Material In Transit Report",
    group: "Part purchase",
    description: "Mobis invoice lines imported as MITs, with what was received, damaged or short, and what is still in transit.",
    permission: PERMISSIONS.STOCK_READ,
    filters: ["vendor", "search", ...PART_FILTERS, "option"],
    labels: { search: "MIT or invoice no. (optional)" },
    options: PENDING_OPTIONS,
    columns: [
      text("mitNumber", "MIT No"),
      date(),
      text("invoiceNumber", "Invoice No"),
      text("caseNumber", "Case No"),
      text("orderNumber", "Order No"),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      qty("quantity", "Invoiced"),
      ...RECEIPT_QTY,
      qty("pending", "In transit"),
      money("unitPrice", "Invoice price", false),
      money("value", "Value (₦)"),
      text("status", "Status"),
    ],
  },
  {
    kind: "receipt-checklist",
    title: "Checklist for Receipts",
    group: "Part purchase",
    description: "Every part received in the period (vendor and branch-transfer MRNs) in bin order, for the store to check against the shelves.",
    permission: PERMISSIONS.STOCK_READ,
    filters: PART_FILTERS,
    columns: [
      text("bin", "Bin"),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      date(),
      text("mrnNumber", "MRN No"),
      text("from", "Received from"),
      qty("quantity", "Qty"),
      text("by", "Received by"),
    ],
  },
  {
    kind: "receipt-shortage",
    title: "MRN / SRN Shortage Report",
    group: "Part purchase",
    description:
      "Receipt lines that do not match what was sent (damaged or short): vendor MRNs against their MIT, by invoice and case, or branch-transfer SRNs against their STN, by packing list and case.",
    permission: PERMISSIONS.STOCK_READ,
    filters: ["search", "vendor", "branch", ...PART_FILTERS, "option"],
    labels: { search: "MRN / SRN, MIT or STN no. (optional)", branch: "Received from branch" },
    options: [
      { value: "MRN", label: "MRN (vendor receipts)" },
      { value: "SRN", label: "SRN (branch transfers)" },
    ],
    columns: {
      MRN: [
        text("mrnNumber", "MRN No"),
        date(),
        text("from", "Vendor"),
        text("invoiceNumber", "Invoice No"),
        text("mitNumber", "MIT No"),
        text("caseNumber", "Case No"),
        text("partNumber", "Part Number"),
        text("description", "Description"),
        qty("expected", "Invoiced"),
        ...RECEIPT_QTY,
        money("rate", "Rate (₦)", false),
        money("value", "Short + damaged value"),
      ],
      SRN: [
        text("mrnNumber", "SRN No"),
        date(),
        text("from", "From branch"),
        text("stnNumber", "STN No"),
        text("packingNumber", "Packing No"),
        text("caseNumber", "Case No"),
        text("partNumber", "Part Number"),
        text("description", "Description"),
        qty("expected", "Sent"),
        ...RECEIPT_QTY,
        money("rate", "Rate", false),
        money("value", "Short + damaged value"),
      ],
    },
  },

  // ── Transfers (the indent outward register and branch in transit are on the Part purchase menu) ──
  {
    kind: "picking-register",
    title: "Picking List Register",
    group: "Transfers",
    description: "Parts picked against branch indents, with bin and picker.",
    permission: PERMISSIONS.TRANSFER_READ,
    filters: PART_FILTERS,
    columns: [
      text("pickingNumber", "Picking No"),
      date(),
      text("indentNumber", "Indent"),
      text("toBranch", "For branch"),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      text("requestedPart", "Alternate for"),
      text("bin", "Bin"),
      qty("picked", "Picked"),
      text("picker", "Picker"),
      text("status", "Status"),
    ],
  },
  {
    kind: "stn-register",
    title: "STN / SRN Register",
    group: "Transfers",
    description: "Stock transfer notes sent from the branch, or stock receipts (transfer MRNs) received into it, document by document with a total under each.",
    permission: PERMISSIONS.TRANSFER_READ,
    filters: [...PART_FILTERS, "option"],
    options: [
      { value: "STN", label: "STN Register" },
      { value: "SRN", label: "Stock Receipt Note" },
    ],
    grouped: true,
    carriedForward: true,
    columns: {
      STN: STN_COLUMNS,
      // On an SRN the store is the sending branch and the quantity is what was received.
      SRN: [
        text("mrnNumber", "Bill Number"),
        date(),
        text("fromBranch", "Store"),
        ...STN_COLUMNS.slice(3),
      ],
    },
  },
  {
    kind: "store-wise-stn",
    title: "Store Wise STN Register",
    group: "Transfers",
    description: "STNs sent from each store, document by document with a total under each.",
    permission: PERMISSIONS.TRANSFER_READ,
    filters: ["branch", ...PART_FILTERS],
    labels: { branch: "To branch" },
    grouped: true,
    carriedForward: true,
    // Legacy leaves off the receiving store and the rate, and adds the STN's charges. Legacy STNs
    // could carry VAT and a discount (rarely); ours cannot yet, so these are zero and Net is Amount.
    columns: [
      ...STN_COLUMNS.filter((c) => c.key !== "toBranch" && c.key !== "rate"),
      money("tax", "Tax"),
      money("discount", "Discount"),
      money("others", "Others"),
      money("net", "Net Amount"),
    ],
  },
  {
    kind: "indent-inward-register",
    title: "Branch Stock Indent Inward Register",
    group: "Transfers",
    description: "Indents other branches raised on this branch, line by line, with what has shipped.",
    permission: PERMISSIONS.TRANSFER_READ,
    filters: ["branch", "search", ...PART_FILTERS, "status", "fullyExecuted"],
    labels: { branch: "From branch", search: "Indent no. (optional)" },
    statuses: ORDER_STATUSES,
    columns: [
      text("indentNumber", "Indent No"),
      date(),
      text("fromBranch", "From branch"),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      qty("requested", "Requested"),
      qty("approved", "Approved"),
      qty("dispatched", "Dispatched"),
      qty("backOrder", "Back order"),
      qty("cancelled", "Cancelled"),
      money("rate", "Rate", false),
      money("value", "Value"),
      text("status", "Status"),
    ],
  },

  {
    kind: "indent-outward-register",
    title: "Branch Stock Indent Outward Register",
    group: "Part purchase",
    description: "Indents this branch raised on other branches, line by line, with what has been shipped to it.",
    permission: PERMISSIONS.TRANSFER_READ,
    filters: ["branch", "search", ...PART_FILTERS, "status", "fullyExecuted"],
    labels: { branch: "Supplying branch", search: "Indent no. (optional)" },
    statuses: ORDER_STATUSES,
    columns: [
      text("indentNumber", "Indent No"),
      date(),
      text("toBranch", "Supplying branch"),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      qty("requested", "Requested"),
      qty("approved", "Approved"),
      qty("dispatched", "Dispatched"),
      qty("backOrder", "Back order"),
      qty("cancelled", "Cancelled"),
      money("rate", "Rate", false),
      money("value", "Value"),
      text("status", "Status"),
    ],
  },
  {
    kind: "branch-in-transit",
    title: "Branch In Transit Report",
    group: "Part purchase",
    description: "STNs dispatched to this branch, with what has arrived and what is still on the way.",
    permission: PERMISSIONS.TRANSFER_READ,
    filters: ["search", "branch", ...PART_FILTERS, "option"],
    labels: { search: "STN no. (optional)", branch: "From branch" },
    options: PENDING_OPTIONS,
    columns: [
      text("stnNumber", "STN No"),
      date(),
      text("fromBranch", "From branch"),
      text("packingNumber", "Packing No"),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      qty("quantity", "Sent"),
      ...RECEIPT_QTY,
      qty("pending", "In transit"),
      money("rate", "Rate", false),
      money("value", "In-transit value"),
      text("status", "Status"),
    ],
  },

  // ── Part sales: stock movement ──
  {
    kind: "consumption",
    title: "Consumption Report (Consolidated)",
    group: "Part sales",
    description: "Part-wise quantities issued in the period by kind (PDI, job order, FOC, goodwill, warranty, counter sale, consumable issue, samples, STN), less returns, at retail rate, with SAN for reference and the closing balance; or the summary by part category.",
    permission: PERMISSIONS.STOCK_READ,
    filters: [...PART_FILTERS, "includeReturns", "summary"],
    carriedForward: true,
    columns: [
      text("partNumber", "Part Number"),
      text("flag", "Flag"),
      text("description", "Description"),
      text("category", "Category"),
      money("dealerRate", "Dealer rate", false),
      money("retailRate", "Retail rate", false),
      ...CONSUMPTION_COLUMNS,
      qty("closing", "Closing balance"),
    ],
    summaryColumns: [...CATEGORY_COLUMNS, ...CONSUMPTION_COLUMNS],
  },
  {
    kind: "issue-checklist",
    title: "Checklist for Issues",
    group: "Part sales",
    description: "Every issue in the period, voucher wise: STNs, counter sales, workshop and other issues, with subtotals.",
    permission: PERMISSIONS.STOCK_READ,
    filters: PART_FILTERS,
    grouped: true,
    carriedForward: true,
    columns: [
      text("voucher", "Voucher No"),
      date(),
      text("code", "Cust code"),
      text("issuedTo", "Customer name"),
      text("partNumber", "Part Number"),
      text("partFlag", "Flag"),
      text("description", "Description"),
      text("unit", "Unit"),
      qty("required", "Qty reqd", false),
      qty("quantity", "Qty issued"),
      money("amount", "Amount"),
    ],
  },
  {
    kind: "stock-adjustments",
    title: "SAN Register",
    group: "Part sales",
    description: "Stock adjustments (additions and subtractions) at dealer rate.",
    permission: PERMISSIONS.STOCK_READ,
    filters: [...PART_FILTERS, "option"],
    options: [
      { value: "ALL", label: "All" },
      { value: "ADDITION", label: "Addition" },
      { value: "SUBTRACTION", label: "Subtraction" },
    ],
    columns: [
      date(),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      qty("quantity", "Qty (+/−)"),
      money("rate", "Dealer rate", false),
      money("value", "Value"),
      text("notes", "Remarks"),
      text("by", "By"),
    ],
  },

  // ── Stock (legacy Stock Reports menu) ──
  {
    kind: "stock-ledger",
    title: "Stock Ledger",
    group: "Stock",
    description: "Every receipt and issue of a part with the running balance, valued FIFO or at dealer rate. Issues are at cost.",
    permission: PERMISSIONS.STOCK_READ,
    filters: [...STOCK_PART_FILTERS, "onlyTransacted", "option"],
    options: FIFO_FIRST,
    labels: BASED_ON,
    grouped: true,
    columns: [
      date(),
      text("type", "Type"),
      text("number", "Doc No"),
      text("party", "Party / Regn. No"),
      text("invoice", "Invoice / Job card"),
      date("invoiceDate", "Invoice date"),
      money("rate", "Rate", false),
      qty("receiptQty", "Receipt qty"),
      money("receiptValue", "Receipt value"),
      qty("issueQty", "Issue qty"),
      money("issueValue", "Issue value"),
      balance("balanceQty", "Balance qty", "qty"),
      balance("balanceValue", "Balance value", "money"),
    ],
  },
  {
    kind: "stock-summary",
    title: "Stock Summary",
    group: "Stock",
    description: "Part-wise opening, receipts, issues and closing stock with values, FIFO or at dealer rate. Also the legacy Stock Value (On FIFO Basis).",
    permission: PERMISSIONS.STOCK_READ,
    filters: [...STOCK_PART_FILTERS, "onlyTransacted", "option"],
    options: FIFO_FIRST,
    labels: BASED_ON,
    grouped: true,
    columns: [
      text("partNumber", "Part Number"),
      text("description", "Description"),
      text("flag", "Flag"),
      text("category", "Category"),
      text("unit", "Unit"),
      text("bin", "Bin"),
      qty("openingQty", "Opening qty"),
      money("openingValue", "Opening value"),
      qty("receiptQty", "Receipt qty"),
      money("receiptValue", "Receipt value"),
      qty("issueQty", "Issue qty"),
      money("issueValue", "Issue value"),
      qty("closingQty", "Closing qty"),
      money("closingValue", "Closing value"),
    ],
  },
  {
    kind: "current-stock",
    title: "Current Stock Balance",
    group: "Stock",
    description: "Parts in stock on a date with their value. As on 31 December it is the next year's List of Opening Balances.",
    permission: PERMISSIONS.STOCK_READ,
    period: "asOn",
    filters: [...STOCK_PART_FILTERS, "option"],
    options: DEALER_FIRST,
    labels: BASED_ON,
    grouped: true,
    columns: [
      text("partNumber", "Part Number"),
      text("description", "Description"),
      text("flag", "Flag"),
      text("category", "Category"),
      text("bin", "Bin"),
      qty("quantity", "Stock"),
      money("rate", "Rate", false),
      money("value", "Value"),
    ],
  },
  {
    kind: "zero-balance",
    title: "List of Zero Balance Items",
    group: "Stock",
    description: "Parts the branch stocks that had no stock on the date, with what was consumed in the 12 months before it.",
    permission: PERMISSIONS.STOCK_READ,
    period: "asOn",
    filters: STOCK_PART_FILTERS,
    grouped: true,
    columns: [...PART_COLUMNS, text("unit", "Unit"), text("bin", "Bin"), qty("consumption", "Consumption (last 12 months)")],
  },
  {
    kind: "slow-moving",
    title: "List of Slow Moving Items",
    group: "Stock",
    description: "Parts in stock that have not been issued for the given number of days, at dealer rate.",
    permission: PERMISSIONS.STOCK_READ,
    period: "asOn",
    filters: [...PART_FILTERS, "days"],
    grouped: true,
    columns: [
      ...PART_COLUMNS,
      text("unit", "Unit"),
      date("lastIssue", "Last issue"),
      qty("idleDays", "Days not issued", false),
      qty("quantity", "Balance"),
      money("rate", "Dealer rate", false),
      money("value", "Value"),
    ],
  },
  {
    kind: "stock-ageing",
    title: "Ageing of Stock",
    group: "Stock",
    description: "Stock on a date split by how long it has been held, FIFO (the newest receipts are the ones in stock).",
    permission: PERMISSIONS.STOCK_READ,
    period: "asOn",
    filters: [...PART_FILTERS, "ageLimits", "option"],
    options: DEALER_FIRST,
    labels: BASED_ON,
    grouped: true,
    // The age-band columns follow the limits asked for; see ageingColumns.
    columns: [...PART_COLUMNS, qty("quantity", "Stock"), money("value", "Total value")],
  },
  {
    kind: "negative-stock",
    title: "Negative Stock Balance",
    group: "Stock",
    description: "Movements in the period that left a part's balance below zero, with the shortfall at dealer rate.",
    permission: PERMISSIONS.STOCK_READ,
    filters: PART_FILTERS,
    grouped: true,
    columns: [
      date(),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      text("type", "Type"),
      text("number", "Doc No"),
      text("party", "Party / Regn. No"),
      qty("quantity", "Qty (+/−)", false),
      qty("balance", "Balance after", false),
      money("rate", "Dealer rate", false),
      money("value", "Shortfall value", false),
    ],
  },
  {
    kind: "inventory-sales-ratio",
    title: "Inventory to Sales Ratio",
    group: "Stock",
    description: "Part-wise opening and closing stock value against what was sold (counter sales and workshop issues, less returns) at cost.",
    permission: PERMISSIONS.STOCK_READ,
    filters: [...PART_FILTERS, "option"],
    options: FIFO_FIRST,
    labels: BASED_ON,
    grouped: true,
    columns: [
      text("partNumber", "Part Number"),
      text("description", "Description"),
      qty("openingQty", "Opening stock"),
      money("openingValue", "Opening value"),
      qty("soldQty", "Sold qty"),
      money("sales", "Sales (at cost)"),
      qty("closingQty", "Closing stock"),
      money("closingValue", "Closing value"),
      qty("ratio", "Inventory / sales", false),
    ],
  },
  {
    kind: "branch-stock",
    title: "Branch Wise Stock",
    group: "Stock",
    description: "Current stock of each part at every branch and store location, at dealer rate: one line per branch, or the total per part.",
    permission: PERMISSIONS.STOCK_READ,
    period: "none",
    allBranches: true,
    filters: [...STOCK_PART_FILTERS, "option"],
    options: [
      { value: "BRANCH", label: "Branch wise part value" },
      { value: "TOTAL", label: "Total part value" },
    ],
    grouped: true,
    columns: {
      BRANCH: [
        text("branch", "Branch"),
        text("bin", "Bin"),
        qty("quantity", "Stock"),
        qty("blocked", "Blocked"),
        qty("available", "Available"),
        money("rate", "Dealer rate", false),
        money("value", "Value"),
      ],
      TOTAL: [
        ...PART_COLUMNS,
        qty("branches", "Branches", false),
        qty("quantity", "Stock"),
        qty("blocked", "Blocked"),
        qty("available", "Available"),
        money("rate", "Dealer rate", false),
        money("value", "Value"),
      ],
    },
  },
  {
    kind: "bin-location-stock",
    title: "Bin Location Wise Stock",
    group: "Stock",
    description: "Current stock in bin order, for checking the shelves.",
    permission: PERMISSIONS.STOCK_READ,
    period: "none",
    filters: ["search", "partType", "partFlag", "priceCategory"],
    labels: { search: "Bin location (optional)" },
    grouped: true,
    columns: [text("bin", "Bin"), ...PART_COLUMNS, text("binCard", "Bin card"), qty("quantity", "Stock")],
  },
  PHYSICAL_STOCK,
  STOCK_TAKE_LOG,
  STOCK_AUDIT,
  STOCK_AUDIT_LOG,
  {
    kind: "parts-blocked",
    title: "List of Parts Blocked",
    group: "Stock",
    description: "Stock picked for CPOs or branch indents and not yet billed or sent on an STN.",
    permission: PERMISSIONS.STOCK_READ,
    filters: [...PART_FILTERS, "option"],
    options: [
      { value: "DETAIL", label: "Document wise" },
      { value: "SUMMARY", label: "Part wise" },
    ],
    grouped: true,
    columns: {
      DETAIL: [
        text("partNumber", "Part Number"),
        text("description", "Description"),
        text("type", "Blocked for"),
        text("document", "Document"),
        date(),
        text("party", "Customer / branch"),
        text("picker", "Picker"),
        qty("quantity", "Blocked qty"),
      ],
      SUMMARY: [
        ...PART_COLUMNS,
        qty("stock", "Stock"),
        qty("cpo", "Blocked for CPOs"),
        qty("indent", "Blocked for indents"),
        qty("blocked", "Total blocked"),
        qty("available", "Available"),
      ],
    },
  },
  {
    kind: "item-unavailability",
    title: "Item Unavailability Report",
    group: "Stock",
    description: "Demand the branch could not supply: CPO quantities still unpicked and indent back orders, against free stock now.",
    permission: PERMISSIONS.STOCK_READ,
    filters: PART_FILTERS,
    grouped: true,
    columns: [
      ...PART_COLUMNS,
      qty("cpo", "CPO pending"),
      qty("backOrder", "Indent back order"),
      qty("quantity", "Unavailable"),
      qty("free", "Free stock now", false),
      money("rate", "Dealer rate", false),
      money("value", "Value"),
    ],
  },

  // ── MIS (legacy Parts > MIS Reports) ──
  {
    kind: "stock-levels",
    title: "Minimum / Maximum Level Report",
    group: "MIS",
    description:
      "Stock on a date against each part's minimum, maximum and re-order levels: every part with levels, the items below their minimum, or the re-order quantity worked out from consumption against the one entered.",
    permission: PERMISSIONS.STOCK_READ,
    period: "asOn",
    filters: [...STOCK_PART_FILTERS, "option", "days"],
    labels: { option: "Show", days: "Re-order: consumption over (days)" },
    options: [
      { value: "MIN_MAX", label: "Minimum / maximum level" },
      { value: "BELOW_MIN", label: "Items falling below minimum level" },
      { value: "REORDER", label: "Re-order calculated vs entered" },
    ],
    grouped: true,
    columns: {
      MIN_MAX: [
        ...PART_COLUMNS,
        text("bin", "Bin"),
        qty("minLevel", "Minimum", false),
        qty("maxLevel", "Maximum", false),
        qty("reorderQty", "Re-order qty", false),
        qty("quantity", "Stock"),
        text("level", "Level"),
      ],
      BELOW_MIN: [
        ...PART_COLUMNS,
        text("bin", "Bin"),
        qty("minLevel", "Minimum", false),
        qty("maxLevel", "Maximum", false),
        qty("quantity", "Stock"),
        qty("shortfall", "Below minimum by"),
        qty("orderQty", "To order (up to maximum)"),
        money("rate", "Dealer rate", false),
        money("value", "Order value"),
      ],
      REORDER: [
        ...PART_COLUMNS,
        qty("quantity", "Stock"),
        qty("monthly", "Consumed per month", false),
        qty("calculated", "Calculated re-order"),
        qty("entered", "Entered re-order"),
        qty("difference", "Entered − calculated"),
      ],
    },
  },
  {
    kind: "max-consumed",
    title: "Maximum Consumed Parts",
    group: "MIS",
    description:
      "The parts consumed most in the period (counter sales, workshop jobs and STNs, less returns), with workshop issues split by the vehicle's mileage.",
    permission: PERMISSIONS.STOCK_READ,
    filters: [...PART_FILTERS, "topN", "option", "mileageLimits"],
    labels: { option: "Consumed by" },
    options: [
      { value: "ALL", label: "All" },
      { value: "COUNTER_SALE", label: "Counter sales" },
      { value: "JOB", label: "Workshop jobs" },
      { value: "STN", label: "STNs" },
    ],
    grouped: true,
    // The mileage-band columns follow the limits asked for; see mileageColumns.
    columns: [],
  },
  {
    kind: "model-mileage-issue",
    title: "Model Wise Mileage Wise Part Issue",
    group: "MIS",
    description: "Parts issued to workshop jobs (less returns) by vehicle model, split by the vehicle's mileage at the job.",
    permission: PERMISSIONS.STOCK_READ,
    filters: [...PART_FILTERS, "mileageLimits"],
    grouped: true,
    columns: [],
  },
  {
    kind: "profitability",
    title: "Profitability Statement",
    group: "MIS",
    description:
      "What parts earned: sale value against cost for counter sales, FOC bills, workshop and PDI jobs, STNs and stock adjustments, with cost FIFO or at dealer rate. Returns are taken off.",
    permission: PERMISSIONS.STOCK_READ,
    filters: [...PART_FILTERS, "option", "summary"],
    options: FIFO_FIRST,
    labels: BASED_ON,
    grouped: true,
    columns: [...PART_COLUMNS, ...PROFIT_COLUMNS],
    summaryColumns: [...CATEGORY_COLUMNS, ...PROFIT_COLUMNS],
  },
  {
    kind: "percent-fill",
    title: "Percent Fill Report",
    group: "MIS",
    description:
      "How much of what was ordered from the branch was supplied: CPO quantities billed and branch indent quantities sent on STNs, part by part. Quantities still open are not counted against the fill.",
    permission: PERMISSIONS.STOCK_READ,
    filters: [...PART_FILTERS, "option"],
    labels: { option: "Order type" },
    options: [
      { value: "ALL", label: "All" },
      { value: "CPO", label: "CPO" },
      { value: "INDENT", label: "Branch indent" },
    ],
    grouped: true,
    columns: [
      ...PART_COLUMNS,
      qty("orders", "Order lines"),
      qty("ordered", "Ordered"),
      qty("supplied", "Supplied"),
      qty("notSupplied", "Not supplied"),
      qty("pending", "Still open"),
      percent("fill", "Fill %", "supplied", "supplied", "notSupplied"),
    ],
  },
  {
    kind: "part-rate-history",
    title: "Part Rate History",
    group: "MIS",
    description: "Every dealer and retail rate set in Part Master, with when and by whom, and the parts deleted from Part Master.",
    permission: PERMISSIONS.STOCK_READ,
    allBranches: true,
    filters: [...PART_FILTERS, "option"],
    labels: { option: "Show" },
    options: [
      { value: "BOTH", label: "Both rates" },
      { value: "RETAIL", label: "Changed retail rate" },
      { value: "DEALER", label: "Changed dealer rate" },
      { value: "DELETED", label: "Only deleted records" },
    ],
    columns: [
      datetime("changedAt", "Changed on"),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      text("flag", "Flag"),
      text("category", "Category"),
      money("oldDealerRate", "Old dealer rate", false),
      money("newDealerRate", "New dealer rate", false),
      money("oldRetailRate", "Old retail rate", false),
      money("newRetailRate", "New retail rate", false),
      text("action", "Change"),
      text("by", "Changed by"),
    ],
  },
  {
    kind: "part-bin-history",
    title: "Part Bin Location History",
    group: "MIS",
    description: "Every change of a part's bin: the branch's rack location, or the default bin in Part Master.",
    permission: PERMISSIONS.STOCK_READ,
    filters: [...PART_FILTERS, "option"],
    labels: { option: "Show" },
    options: [
      { value: "ALL", label: "All" },
      { value: "BRANCH", label: "Branch bin changes" },
      { value: "PART_MASTER", label: "Part Master bin changes" },
    ],
    columns: [
      datetime("changedAt", "Changed on"),
      ...PART_COLUMNS,
      text("location", "Changed in"),
      text("oldBin", "Old bin"),
      text("newBin", "New bin"),
      text("by", "Changed by"),
    ],
  },
  {
    kind: "packing-list-register",
    title: "Packing List Cum Gate Pass Report (STN)",
    group: "MIS",
    description:
      "Packing lists (gate passes) for STNs dispatched from the branch, by receiving branch, courier, date or packing list number: each case and part, or one line per packing list.",
    permission: PERMISSIONS.TRANSFER_READ,
    filters: ["branch", "option", "summary"],
    labels: { branch: "To branch", option: "Arrange" },
    options: [
      { value: "BRANCH", label: "Branch wise" },
      { value: "COURIER", label: "Courier name wise" },
      { value: "DATE", label: "Packing list date wise" },
      { value: "NUMBER", label: "Packing list no. wise" },
    ],
    grouped: true,
    columns: [
      text("packingNumber", "Packing No"),
      date(),
      text("gatePass", "Gate pass"),
      text("stnNumber", "STN No"),
      text("toBranch", "To branch"),
      text("caseNumber", "Case No"),
      text("partNumber", "Part Number"),
      text("description", "Description"),
      qty("quantity", "Qty"),
      money("rate", "Rate", false),
      money("value", "Value"),
    ],
    summaryColumns: [
      text("packingNumber", "Packing No"),
      date(),
      text("gatePass", "Gate pass"),
      text("stnNumber", "STN No"),
      text("toBranch", "To branch"),
      text("mode", "Dispatch mode"),
      text("courier", "Courier"),
      text("waybill", "Waybill"),
      qty("cases", "Cases"),
      qty("quantity", "Qty"),
      qty("weight", "Weight (kg)"),
      money("value", "Value"),
      text("status", "Status"),
    ],
  },
];

export const reportByKind = new Map(REPORTS.map((r) => [r.kind, r]));

/** Ageing of Stock: stock and value in each age band of the limits asked for. */
function ageingColumns(limits: number[]): ReportColumn[] {
  const bands = bandLabels(limits).flatMap((label, i) => [qty(`age${i}Qty`, `${label} qty`), money(`age${i}Value`, `${label} value`)]);
  return [...PART_COLUMNS, qty("quantity", "Stock"), ...bands, money("value", "Total value")];
}

/** Workshop issue quantity in each mileage band, and issues on jobs with no mileage recorded. */
function mileageColumns(limits: number[]): ReportColumn[] {
  return [...bandLabels(limits, "km").map((label, i) => qty(`mileage${i}`, label)), qty("mileageNone", "Mileage not recorded")];
}

/** The report's columns for the filters asked for: per option, the summary, or age and mileage bands. */
export function columnsFor(definition: ReportDefinition, f: Pick<ReportFilters, "option" | "summary" | "ageLimits" | "mileageLimits">): ReportColumn[] {
  const mileage = mileageColumns(f.mileageLimits ?? DEFAULT_MILEAGE_LIMITS);
  switch (definition.kind) {
    case "stock-ageing":
      return ageingColumns(f.ageLimits ?? DEFAULT_AGE_LIMITS);
    case "max-consumed":
      return [
        qty("rank", "Rank", false),
        ...PART_COLUMNS,
        qty("counterSale", "Counter sales"),
        qty("job", "Workshop jobs"),
        qty("stn", "STNs"),
        qty("quantity", "Total consumed"),
        money("rate", "Dealer rate", false),
        money("value", "Value"),
        ...mileage,
      ];
    case "model-mileage-issue":
      return [...PART_COLUMNS, ...mileage, qty("quantity", "Total issued")];
  }
  if (f.summary && definition.summaryColumns) return definition.summaryColumns;
  if (Array.isArray(definition.columns)) return definition.columns;
  return definition.columns[f.option ?? ""] ?? Object.values(definition.columns)[0];
}
