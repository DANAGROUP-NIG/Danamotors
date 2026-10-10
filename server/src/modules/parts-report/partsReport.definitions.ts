/**
 * Parts reports (legacy Parts module report menu). One definition per report: the screen
 * renders its filters and columns from here, and the service builds its rows.
 */
import { PERMISSIONS } from "../../shared/constants/roles";
import { ageBandLabels } from "./stockReport.logic";

export type ColumnType = "text" | "date" | "qty" | "money" | "percent";

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
  /** Summed into the report total and each group subtotal. "last" (running balances): each group
   * shows its last line's value, and the report total adds up those closing values. */
  total?: boolean | "last";
}

export type ReportFilterKey =
  | "customer"
  | "vendor"
  | "executive"
  | "branch"
  | "part"
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
  | "ageLimits";

export interface ReportDefinition {
  kind: string;
  title: string;
  group: "Counter sales" | "Customer orders" | "Purchase" | "Transfers" | "Stock movement" | "Stock";
  description: string;
  permission: string;
  filters: ReportFilterKey[];
  /** The dates asked for: a range (default), one as-on date (sent as `to`), or none (today's stock). */
  period?: "range" | "asOn" | "none";
  /** Covers every branch; the branch filter does not apply. */
  allBranches?: boolean;
  /** Labels for the `branch` (the other branch), `search` (document number) and `option` filters. */
  labels?: { branch?: string; search?: string; option?: string };
  /** Choices for the `option` filter (legacy radio buttons). The first is the default. */
  options?: { value: string; label: string }[];
  /** Choices for the `status` filter. */
  statuses?: { value: string; label: string }[];
  /** Rows carry a `group` value; the screen shows a heading and subtotal per group. */
  grouped?: boolean;
  columns: ReportColumn[] | Record<string, ReportColumn[]>;
}

const money = (key: string, label: string, total = true): ReportColumn => ({ key, label, type: "money", total });
const qty = (key: string, label: string, total = true): ReportColumn => ({ key, label, type: "qty", total });
const text = (key: string, label: string): ReportColumn => ({ key, label, type: "text" });
const date = (key = "date", label = "Date"): ReportColumn => ({ key, label, type: "date" });
const balance = (key: string, label: string, type: "qty" | "money"): ReportColumn => ({ key, label, type, total: "last" });

const PART_FILTERS: ReportFilterKey[] = ["part", "partFlag", "priceCategory"];
const STOCK_PART_FILTERS: ReportFilterKey[] = ["part", "includeAlternates", "partFlag", "priceCategory"];
const FIFO_FIRST = [
  { value: "FIFO", label: "FIFO" },
  { value: "DEALER", label: "Dealer rate" },
];
const DEALER_FIRST = [FIFO_FIRST[1], FIFO_FIRST[0]];
const BASED_ON = { option: "Based on" };
const PART_COLUMNS: ReportColumn[] = [text("partNumber", "Part No"), text("description", "Description"), text("category", "Category")];
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
const STN_COLUMNS: ReportColumn[] = [
  text("stnNumber", "STN No"),
  date(),
  text("toBranch", "To branch"),
  text("indents", "Indent(s)"),
  text("partNumber", "Part No"),
  text("description", "Description"),
  qty("quantity", "Qty"),
  money("rate", "Rate", false),
  money("amount", "Amount"),
  qty("accounted", "Received"),
  text("status", "Status"),
];

export const REPORTS: ReportDefinition[] = [
  // ── Counter sales ──
  {
    kind: "counter-sales",
    title: "Counter Sales Register",
    group: "Counter sales",
    description: "Every counter-sale bill line: part, quantity, rate, cash discount, VAT and net value.",
    permission: PERMISSIONS.PART_SALE_READ,
    filters: ["customer", ...PART_FILTERS],
    columns: [
      text("billNumber", "Bill No"),
      date(),
      text("customerCode", "Code"),
      text("customer", "Customer"),
      text("cpoNumber", "CPO"),
      text("partNumber", "Part No"),
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
    group: "Counter sales",
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
    group: "Counter sales",
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
    group: "Counter sales",
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
    group: "Counter sales",
    description: "Parts returned against counter-sale bills, at the bill's discount and VAT.",
    permission: PERMISSIONS.PART_SALE_READ,
    filters: ["customer", ...PART_FILTERS],
    columns: [
      text("returnNumber", "Return No"),
      date(),
      text("billNumber", "Bill No"),
      text("customer", "Customer"),
      text("partNumber", "Part No"),
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
    group: "Counter sales",
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
    group: "Counter sales",
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
      { key: "marginPercent", label: "Margin %", type: "percent" },
    ],
  },
  {
    kind: "sales-executive-register",
    title: "Sales Executive Wise Counter Sales Register",
    group: "Counter sales",
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

  // ── Customer orders ──
  {
    kind: "cpo-register",
    title: "CPO Register",
    group: "Customer orders",
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
      text("partNumber", "Part No"),
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

  // ── Purchase ──
  {
    kind: "mrn-register",
    title: "MRN Register",
    group: "Purchase",
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
        text("partNumber", "Part No"),
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
    group: "Purchase",
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
      text("partNumber", "Part No"),
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
    group: "Purchase",
    description: "Every part received in the period (vendor and branch-transfer MRNs) in bin order, for the store to check against the shelves.",
    permission: PERMISSIONS.STOCK_READ,
    filters: PART_FILTERS,
    columns: [
      text("bin", "Bin"),
      text("partNumber", "Part No"),
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
    group: "Purchase",
    description: "Receipt lines with damaged or missing quantities: vendor MRNs by invoice and case, or branch-transfer SRNs by STN, packing list and case.",
    permission: PERMISSIONS.STOCK_READ,
    filters: ["search", "branch", ...PART_FILTERS, "option"],
    labels: { search: "MRN / SRN no. (optional)", branch: "Received from branch" },
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
        text("partNumber", "Part No"),
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
        text("partNumber", "Part No"),
        text("description", "Description"),
        qty("expected", "Sent"),
        ...RECEIPT_QTY,
        money("rate", "Rate", false),
        money("value", "Short + damaged value"),
      ],
    },
  },

  // ── Transfers ──
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
      text("partNumber", "Part No"),
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
    description: "Stock transfer notes sent from the branch, or stock receipts (transfer MRNs) received into it.",
    permission: PERMISSIONS.TRANSFER_READ,
    filters: [...PART_FILTERS, "option"],
    options: [
      { value: "STN", label: "STN register" },
      { value: "SRN", label: "Stock receipt note" },
    ],
    columns: {
      STN: STN_COLUMNS,
      SRN: [
        text("mrnNumber", "MRN No"),
        date(),
        text("fromBranch", "From branch"),
        text("stnNumber", "STN No"),
        text("partNumber", "Part No"),
        text("description", "Description"),
        qty("received", "Received"),
        qty("damaged", "Damaged"),
        qty("short", "Short"),
        money("rate", "Rate", false),
        money("value", "Value"),
      ],
    },
  },
  {
    kind: "store-wise-stn",
    title: "Store Wise STN Register",
    group: "Transfers",
    description: "STNs sent from the branch, grouped by receiving branch, with subtotals.",
    permission: PERMISSIONS.TRANSFER_READ,
    filters: ["branch", ...PART_FILTERS],
    labels: { branch: "To branch" },
    grouped: true,
    columns: STN_COLUMNS,
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
      text("partNumber", "Part No"),
      text("description", "Description"),
      qty("requested", "Requested"),
      qty("approved", "Approved"),
      qty("dispatched", "Dispatched"),
      qty("backOrder", "Back order"),
      money("rate", "Rate", false),
      money("value", "Value"),
      text("status", "Status"),
    ],
  },

  {
    kind: "indent-outward-register",
    title: "Branch Stock Indent Outward Register",
    group: "Transfers",
    description: "Indents this branch raised on other branches, line by line, with what has been shipped to it.",
    permission: PERMISSIONS.TRANSFER_READ,
    filters: ["branch", "search", ...PART_FILTERS, "status", "fullyExecuted"],
    labels: { branch: "Supplying branch", search: "Indent no. (optional)" },
    statuses: ORDER_STATUSES,
    columns: [
      text("indentNumber", "Indent No"),
      date(),
      text("toBranch", "Supplying branch"),
      text("partNumber", "Part No"),
      text("description", "Description"),
      qty("requested", "Requested"),
      qty("approved", "Approved"),
      qty("dispatched", "Dispatched"),
      qty("backOrder", "Back order"),
      money("rate", "Rate", false),
      money("value", "Value"),
      text("status", "Status"),
    ],
  },
  {
    kind: "branch-in-transit",
    title: "Branch In Transit Report",
    group: "Transfers",
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
      text("partNumber", "Part No"),
      text("description", "Description"),
      qty("quantity", "Sent"),
      ...RECEIPT_QTY,
      qty("pending", "In transit"),
      money("rate", "Rate", false),
      money("value", "In-transit value"),
      text("status", "Status"),
    ],
  },

  // ── Stock movement ──
  {
    kind: "consumption",
    title: "Consumption Report (Consolidated)",
    group: "Stock movement",
    description: "Part-wise quantities issued (counter sales, workshop issues) and transferred out, less returns.",
    permission: PERMISSIONS.STOCK_READ,
    filters: [...PART_FILTERS, "includeReturns"],
    columns: [
      text("partNumber", "Part No"),
      text("description", "Description"),
      text("category", "Category"),
      qty("issued", "Issued"),
      qty("transferred", "Transferred out"),
      qty("returned", "Returned"),
      qty("net", "Net consumption"),
      money("rate", "Dealer rate", false),
      money("value", "Value"),
    ],
  },
  {
    kind: "issue-checklist",
    title: "Checklist for Issues",
    group: "Stock movement",
    description: "Every issue in the period in bin order, for the store to check against the shelves.",
    permission: PERMISSIONS.STOCK_READ,
    filters: PART_FILTERS,
    columns: [
      text("bin", "Bin"),
      text("partNumber", "Part No"),
      text("description", "Description"),
      date(),
      text("type", "Issue type"),
      text("reference", "Reference"),
      qty("quantity", "Qty"),
      text("by", "Issued by"),
    ],
  },
  {
    kind: "stock-adjustments",
    title: "SAN Register",
    group: "Stock movement",
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
      text("partNumber", "Part No"),
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
      text("partNumber", "Part No"),
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
      text("partNumber", "Part No"),
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
      text("partNumber", "Part No"),
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
      text("partNumber", "Part No"),
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
    filters: ["search", "partFlag", "priceCategory"],
    labels: { search: "Bin location (optional)" },
    grouped: true,
    columns: [text("bin", "Bin"), ...PART_COLUMNS, text("binCard", "Bin card"), qty("quantity", "Stock")],
  },
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
        text("partNumber", "Part No"),
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
];

export const reportByKind = new Map(REPORTS.map((r) => [r.kind, r]));

/** Ageing of Stock: stock and value in each age band of the limits asked for. */
export function ageingColumns(limits: number[]): ReportColumn[] {
  const bands = ageBandLabels(limits).flatMap((label, i) => [qty(`age${i}Qty`, `${label} qty`), money(`age${i}Value`, `${label} value`)]);
  return [...PART_COLUMNS, qty("quantity", "Stock"), ...bands, money("value", "Total value")];
}

export function columnsFor(definition: ReportDefinition, option?: string): ReportColumn[] {
  if (Array.isArray(definition.columns)) return definition.columns;
  return definition.columns[option ?? ""] ?? Object.values(definition.columns)[0];
}
