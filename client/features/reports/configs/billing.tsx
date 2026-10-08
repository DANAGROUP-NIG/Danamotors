import { FileSpreadsheet, Gift, ReceiptText } from "lucide-react";
import { REPORT_PERMISSIONS } from "@/features/auth/roles";
import { fmtDate, fmtMoney, fmtNumber } from "../lib/report-format";
import type { ReportConfig, ReportResponse } from "../types";
import { addressColumns, count, jobColumn, modelColumn, printAddressOption, RANGE_PRESETS, registrationColumn, STD_FILTERS, STD_WITH_DELIVERED, str } from "./shared";

const BILL_NOTE = "Zero-value bills are listed separately. Cash and credit bills share one group until bills record their type.";

const billColumn = {
  key: "billNumber",
  label: "Bill no / date",
  text: (row: Record<string, unknown>) => `${str(row, "billNumber")} ${fmtDate(row.billDate)}`,
  value: (row: Record<string, unknown>) => str(row, "billNumber"),
  render: (row: Record<string, unknown>) => (
    <div className="whitespace-nowrap">
      <div className="font-medium">{str(row, "billNumber")}</div>
      <div className="text-xs text-muted-foreground">{fmtDate(row.billDate)}</div>
    </div>
  ),
};

const billCards = (data: ReportResponse) => {
  const zero = data.groups.find((group) => group.key === "ZERO");
  const billed = data.groups.find((group) => group.key === "BILLED");
  return [
    { label: "Bills", value: fmtNumber(count(data), "integer"), tone: "blue" as const },
    { label: "Cash and credit", value: fmtNumber(billed?.count ?? 0, "integer"), sub: fmtMoney(billed?.totals.billAmount ?? 0) },
    { label: "Zero value", value: fmtNumber(zero?.count ?? 0, "integer"), tone: "gray" as const },
  ];
};

// ── 10. Daily labour register ───────────────────────────────────────────────

export const dailyLabourRegisterConfig: ReportConfig = {
  slug: "daily-labour-register",
  title: "Daily labour register",
  description: "Labour billed per job bill, including warranty and free-of-cost labour.",
  category: "Billing",
  permission: REPORT_PERMISSIONS.DAILY_LABOUR_REGISTER,
  width: 132,
  icon: ReceiptText,
  period: { kind: "range", label: "Bill date", presets: RANGE_PRESETS, defaultPreset: "today" },
  filters: [...STD_FILTERS, "technician"],
  hasMode: true,
  noun: ["bill", "bills"],
  columns: [
    jobColumn({ withDate: true }),
    registrationColumn(),
    { key: "customer", label: "Customer", className: "min-w-36" },
    modelColumn(),
    { key: "vin", label: "VIN", className: "whitespace-nowrap font-mono text-xs" },
    { key: "serviceType", label: "Type of repair" },
    billColumn,
    { key: "labourCharges", label: "Labour", format: "money" },
    { key: "discount", label: "Discount", format: "money" },
    { key: "serviceCharges", label: "Service charges", format: "money" },
    { key: "vatOnLabour", label: "VAT on labour", format: "money" },
    { key: "totalLabour", label: "Total labour", format: "money", className: "font-semibold" },
    { key: "billAmount", label: "Bill amount", format: "money" },
    { key: "warrantyLabour", label: "Warranty labour", format: "money", className: "bg-purple-50/50" },
    { key: "focLabour", label: "FOC labour", format: "money", className: "bg-slate-50" },
  ],
  summaryCards: (data) => [
    ...billCards(data),
    { label: "Total labour", value: fmtMoney(data.totals.totalLabour ?? 0) },
    { label: "VAT on labour", value: fmtMoney(data.totals.vatOnLabour ?? 0) },
    { label: "Warranty labour", value: fmtMoney(data.totals.warrantyLabour ?? 0), tone: "purple" },
    { label: "FOC labour", value: fmtMoney(data.totals.focLabour ?? 0), tone: "gray" },
  ],
  subtotalLabel: (group) => `Total ${group.label.toLowerCase()} · ${group.count}`,
  footnote: `Total labour = labour − discount + service charges + VAT on labour. Warranty and FOC (free and goodwill) labour are charged to the manufacturer or the company, not on the customer's bill. External labour and WCT are not recorded in this system. ${BILL_NOTE}`,
};

// ── 11. Workshop bill report ────────────────────────────────────────────────

export const workshopBillConfig: ReportConfig = {
  slug: "workshop-bill",
  title: "Workshop bill report",
  description: "Bills raised for workshop jobs in a period.",
  category: "Billing",
  permission: REPORT_PERMISSIONS.WORKSHOP_BILL,
  width: 80,
  icon: FileSpreadsheet,
  period: { kind: "range", label: "Bill date", presets: RANGE_PRESETS, defaultPreset: "today" },
  filters: STD_WITH_DELIVERED,
  options: [
    printAddressOption,
    { kind: "segmented", key: "orderBy", label: "Order by", default: "jobNumber", choices: [{ value: "jobNumber", label: "Job no" }, { value: "billNumber", label: "Bill no" }] },
    { kind: "checkbox", key: "showBreakdown", label: "Show parts / labour breakdown", local: true },
  ],
  hasMode: true,
  noun: ["bill", "bills"],
  columns: [
    jobColumn(),
    { key: "jobDate", label: "Job date", format: "date" },
    registrationColumn(),
    { key: "customer", label: "Customer", className: "min-w-36" },
    ...addressColumns(),
    modelColumn(),
    { key: "serviceType", label: "Service" },
    { key: "deliveredBy", label: "Delivered by" },
    { key: "gatePassNumber", label: "Gate pass no", className: "whitespace-nowrap" },
    billColumn,
    { key: "partsAmount", label: "Parts", format: "money", whenOption: "showBreakdown" },
    { key: "labourAmount", label: "Labour", format: "money", whenOption: "showBreakdown" },
    { key: "discount", label: "Discount", format: "money", whenOption: "showBreakdown" },
    { key: "vatAmount", label: "VAT", format: "money", whenOption: "showBreakdown" },
    { key: "roundOff", label: "Round-off", format: "money", whenOption: "showBreakdown" },
    { key: "billAmount", label: "Total amount", format: "money", className: "font-semibold" },
  ],
  summaryCards: (data) => [...billCards(data), { label: "Total", value: fmtMoney(data.totals.billAmount ?? 0), tone: "emerald" }],
  subtotalLabel: (group) => `Total ${group.label.toLowerCase()} · ${group.count}`,
  footnote: `Labour includes service charges. ${BILL_NOTE}`,
};

// ── 13. Free service report ─────────────────────────────────────────────────

function FreeServiceSummary({ data }: { data: ReportResponse }) {
  const items = data.breakdown ?? [];
  if (!items.length) return null;
  const numbers = Array.from(new Set(items.map((item) => item.key.split("::")[1]))).sort();
  const models = Array.from(new Set(items.map((item) => item.label))).sort();
  const cell = (model: string, no: string) => items.find((item) => item.label === model && item.key.split("::")[1] === no);
  const label = (no: string) => (no === "none" ? "No number" : `${no}${no === "1" ? "st" : no === "2" ? "nd" : no === "3" ? "rd" : "th"}`);
  return (
    <section className="overflow-x-auto rounded-xl border border-[#e8edf3] bg-white shadow-sm" aria-label="Free services by model">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="bg-[#f8fafc] text-slate-500">
          <tr>
            <th scope="col" className="px-3 py-2.5 text-left font-semibold">Model</th>
            {numbers.map((no) => <th key={no} scope="col" className="px-3 py-2.5 text-right font-semibold">{label(no)}</th>)}
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Net claimable</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model} className="border-t border-[#e8edf3]">
              <td className="px-3 py-2">{model}</td>
              {numbers.map((no) => <td key={no} className="px-3 py-2 text-right tabular-nums">{cell(model, no)?.count ?? 0}</td>)}
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(items.filter((item) => item.label === model).reduce((sum, item) => sum + (item.amount ?? 0), 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export const freeServiceConfig: ReportConfig = {
  slug: "free-service",
  title: "Free service report",
  description: "Complimentary services on new vehicles and the amount claimable from the manufacturer.",
  category: "Billing",
  permission: REPORT_PERMISSIONS.FREE_SERVICE,
  width: 80,
  icon: Gift,
  period: { kind: "range", label: "Bill date", presets: RANGE_PRESETS, defaultPreset: "lastMonth" },
  filters: STD_WITH_DELIVERED,
  hasMode: true,
  noun: ["free service", "free services"],
  columns: [
    jobColumn({ withDate: true }),
    { key: "billDate", label: "Bill date", format: "date" },
    registrationColumn(true),
    { key: "engineNumber", label: "Engine no", className: "whitespace-nowrap font-mono text-xs" },
    modelColumn(),
    { key: "saleDate", label: "Sale date", format: "date", value: (row) => (row.saleDate ? `${str(row, "saleDate")}T12:00:00Z` : null) },
    { key: "sellingDealer", label: "Selling dealer" },
    { key: "mileage", label: "Mileage (km)", format: "integer" },
    { key: "freeServiceNo", label: "Free svc no", format: "integer", align: "center" },
    { key: "couponNo", label: "Coupon no", className: "whitespace-nowrap" },
    { key: "serviceCharge", label: "Service charge", format: "money" },
    { key: "otherCharges", label: "Other charges", format: "money" },
    { key: "netClaimable", label: "Net claimable", format: "money", className: "font-semibold" },
  ],
  summaryCards: (data) => [
    { label: "Free services", value: fmtNumber(count(data), "integer"), tone: "blue" },
    ...data.groups.slice(0, 3).map((group) => ({ label: group.label, value: fmtNumber(group.count, "integer") })),
    { label: "Service charges", value: fmtMoney(data.totals.serviceCharge ?? 0) },
    { label: "Net claimable", value: fmtMoney(data.totals.netClaimable ?? 0), tone: "emerald" as const },
  ],
  extra: (data) => <FreeServiceSummary data={data} />,
  subtotalLabel: (group) => `Subtotal — ${group.label} · ${group.count}`,
  footnote: "Only jobs whose service type is marked as a free service. Other charges = warranty labour and warranty parts on the job. Net claimable = service charge + other charges.",
};

export const BILLING_CONFIGS = [dailyLabourRegisterConfig, workshopBillConfig, freeServiceConfig];
