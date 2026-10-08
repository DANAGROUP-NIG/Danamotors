import Link from "next/link";
import { CalendarDays, FileText } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/table-components/StatusBadge";
import { REPORT_PERMISSIONS } from "@/features/auth/roles";
import { fmtDate, fmtMoney, fmtNumber } from "../lib/report-format";
import type { ReportConfig, ReportRow } from "../types";
import { addressColumns, count, modelColumn, printAddressOption, registrationColumn, str } from "./shared";

const BOOKING: Record<string, { label: string; tone: StatusTone }> = {
  BOOKED: { label: "Booked", tone: "blue" },
  CONVERTED: { label: "Arrived", tone: "emerald" },
  NO_SHOW: { label: "No-show", tone: "gray" },
  CANCELLED: { label: "Cancelled", tone: "red" },
};

function bookingText(row: ReportRow) {
  const status = BOOKING[str(row, "bookingStatus")];
  const label = status?.label ?? str(row, "bookingStatus");
  return row.jobNumber ? `${label} · ${str(row, "jobNumber")}` : label;
}

// ── 1. Service booking report ───────────────────────────────────────────────

export const serviceBookingConfig: ReportConfig = {
  slug: "service-booking",
  title: "Service booking report",
  description: "Vehicles booked to come in for service on a date.",
  category: "Front office",
  permission: REPORT_PERMISSIONS.SERVICE_BOOKING,
  width: 80,
  icon: CalendarDays,
  period: { kind: "date", label: "Booked for", dateLabel: "Booked for", presets: ["today", "tomorrow", "yesterday"], defaultPreset: "today" },
  filters: ["model", "variant", "serviceType"],
  options: [printAddressOption],
  noun: ["booking", "bookings"],
  columns: [
    { key: "bookingNumber", label: "Booking no", className: "whitespace-nowrap font-medium" },
    { key: "scheduledAt", label: "Booked for", format: "datetime" },
    registrationColumn(true),
    { key: "customer", label: "Customer", className: "min-w-36" },
    ...addressColumns(),
    modelColumn(),
    { key: "serviceType", label: "Service type" },
    { key: "mileage", label: "Mileage (km)", format: "integer" },
    { key: "requests", label: "Requests", className: "min-w-40 text-xs" },
    { key: "estimatedAmount", label: "Est. amount", format: "money" },
    {
      key: "bookingStatus",
      label: "Status",
      text: bookingText,
      totalKey: "arrived",
      totalFormat: "integer",
      render: (row) => {
        const status = BOOKING[str(row, "bookingStatus")];
        return <StatusBadge status={bookingText(row)} tone={status?.tone ?? "gray"} className="whitespace-nowrap px-2 py-0 text-xs normal-case" />;
      },
    },
  ],
  summaryCards: (data) => {
    const s = data.summary ?? {};
    const total = Number(s.total ?? 0);
    const arrived = Number(s.CONVERTED ?? 0);
    return [
      { label: "Bookings", value: fmtNumber(total, "integer") },
      { label: "Arrived", value: fmtNumber(arrived, "integer"), tone: "emerald", sub: total ? `${Math.round((arrived / total) * 100)}% arrival` : undefined },
      { label: "Awaiting", value: fmtNumber(Number(s.BOOKED ?? 0), "integer"), tone: "blue" },
      { label: "No-show", value: fmtNumber(Number(s.NO_SHOW ?? 0), "integer"), tone: "gray" },
      { label: "Cancelled", value: fmtNumber(Number(s.CANCELLED ?? 0), "integer"), tone: "red" },
    ];
  },
  subtotalLabel: (group) => `Subtotal — ${group.label} · ${group.count} ${group.count === 1 ? "booking" : "bookings"} · ${group.totals.arrived ?? 0} arrived · ${fmtMoney(group.totals.estimatedAmount ?? 0)}`,
  totalLabel: (data) => `Grand total · ${fmtNumber(count(data), "integer")} bookings · ${data.totals.arrived ?? 0} arrived · ${fmtMoney(data.totals.estimatedAmount ?? 0)}`,
  footnote: "Arrived = a job card was opened from the booking. Estimated amount = parts, labour and oil estimated on the booking requests.",
  emptyMessage: "No vehicles are booked for this day",
};

// ── 2. Job estimate register ────────────────────────────────────────────────

const APPROVAL: Record<string, { label: string; tone: StatusTone }> = {
  approved: { label: "Approved", tone: "emerald" },
  pending: { label: "Pending approval", tone: "amber" },
  declined: { label: "Declined", tone: "red" },
};
const LIFECYCLE: Record<string, string> = { ACTIVE: "Active", PENDING_APPROVAL: "Pending", CLOSED: "Closed" };
const CLOSED_REASON: Record<string, string> = { CONVERTED: "job opened", DECLINED: "declined", CANCELLED: "cancelled" };

function lifecycleText(row: ReportRow) {
  const status = LIFECYCLE[str(row, "estimateStatus")] ?? str(row, "estimateStatus");
  const reason = CLOSED_REASON[str(row, "closedReason")];
  return reason ? `${status} · ${reason}` : status;
}

type EstimateLineRow = { type: string; description: string; quantity: number; rate: number; amount: number };

function EstimateLines({ lines }: { lines: EstimateLineRow[] }) {
  if (!lines.length) return <p className="text-xs text-muted-foreground">No lines.</p>;
  return (
    <table className="w-full max-w-4xl text-xs">
      <thead className="text-left text-slate-500">
        <tr>
          <th className="py-1 pr-3 font-semibold">Type</th>
          <th className="py-1 pr-3 font-semibold">Description</th>
          <th className="py-1 pr-3 text-right font-semibold">Qty / hrs</th>
          <th className="py-1 pr-3 text-right font-semibold">Rate</th>
          <th className="py-1 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, index) => (
          <tr key={index} className="border-t border-[#e8edf3]">
            <td className="py-1 pr-3">
              <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-slate-600 ring-1 ring-slate-200">{line.type.replace("INCLUDED_", "")}</span>
              {line.type.startsWith("INCLUDED_") && <span className="ml-1 text-muted-foreground">in service</span>}
            </td>
            <td className="py-1 pr-3">{line.description}</td>
            <td className="py-1 pr-3 text-right tabular-nums">{fmtNumber(line.quantity)}</td>
            <td className="py-1 pr-3 text-right tabular-nums">{fmtMoney(line.rate)}</td>
            <td className="py-1 text-right tabular-nums">{fmtMoney(line.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const jobEstimateRegisterConfig: ReportConfig = {
  slug: "job-estimate-register",
  title: "Job estimate register",
  description: "Estimates prepared, their amounts, and whether a job was opened.",
  category: "Front office",
  permission: REPORT_PERMISSIONS.JOB_ESTIMATE_REGISTER,
  width: 132,
  icon: FileText,
  period: { kind: "range", label: "Estimate date", presets: ["today", "yesterday", "thisWeek", "thisMonth", "lastMonth"], defaultPreset: "thisMonth" },
  filters: ["model", "variant"],
  options: [
    {
      kind: "segmented",
      key: "estimateStatus",
      label: "Estimate status",
      default: "all",
      choices: [
        { value: "active", label: "Active" },
        { value: "pending", label: "Pending approval" },
        { value: "closed", label: "Closed" },
        { value: "all", label: "All" },
      ],
    },
    {
      kind: "segmented",
      key: "jobStatus",
      label: "Job status",
      default: "both",
      choices: [
        { value: "not_opened", label: "Not opened" },
        { value: "opened", label: "Opened" },
        { value: "both", label: "Both" },
      ],
    },
    { kind: "checkbox", key: "withLines", label: "Show estimate lines", default: true },
  ],
  noun: ["estimate", "estimates"],
  columns: [
    {
      key: "estimateNumber",
      label: "Estimate no / date",
      text: (row) => `${str(row, "estimateNumber")} ${fmtDate(row.estimateDate)}`,
      value: (row) => str(row, "estimateNumber"),
      render: (row) => (
        <div className="whitespace-nowrap">
          <div className="font-semibold">{str(row, "estimateNumber")}</div>
          <div className="text-xs text-muted-foreground">{fmtDate(row.estimateDate)}</div>
        </div>
      ),
    },
    registrationColumn(),
    { key: "customer", label: "Customer", className: "min-w-36" },
    modelColumn(),
    { key: "serviceType", label: "Service type" },
    { key: "partsAmount", label: "Parts", format: "money" },
    { key: "labourAmount", label: "Labour", format: "money" },
    { key: "serviceAmount", label: "Service", format: "money" },
    { key: "discountAmount", label: "Discount", format: "money" },
    { key: "netAmount", label: "Net amount", format: "money", className: "font-semibold" },
    {
      key: "approval",
      label: "Approval",
      text: (row) => APPROVAL[str(row, "approval").toLowerCase()]?.label ?? str(row, "approval"),
      render: (row) => {
        const approval = APPROVAL[str(row, "approval").toLowerCase()];
        return <StatusBadge status={approval?.label ?? str(row, "approval")} tone={approval?.tone ?? "gray"} className="whitespace-nowrap px-2 py-0 text-xs normal-case" />;
      },
    },
    { key: "estimateStatus", label: "Estimate status", text: lifecycleText, className: "whitespace-nowrap text-xs" },
    {
      key: "jobNumber",
      label: "Job no",
      render: (row) =>
        row.jobId ? (
          <Link href={`/job-cards/${String(row.jobId)}`} className="font-medium text-blue-700 underline-offset-2 hover:underline">{str(row, "jobNumber")}</Link>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
  ],
  rowDetail: (row, options) => (options.withLines === "true" && Array.isArray(row.lines) && row.lines.length ? <EstimateLines lines={row.lines as EstimateLineRow[]} /> : null),
  summaryCards: (data) => {
    const s = data.summary ?? {};
    return [
      { label: "Estimates", value: fmtNumber(Number(s.count ?? 0), "integer"), tone: "blue" },
      { label: "Estimate value", value: fmtMoney(data.totals.netAmount ?? 0), tone: "gray" },
      { label: "Approved", value: fmtNumber(Number(s.approved ?? 0), "integer"), tone: "emerald" },
      { label: "Pending", value: fmtNumber(Number(s.pending ?? 0), "integer"), tone: "amber" },
      { label: "Jobs opened", value: fmtNumber(Number(s.opened ?? 0), "integer"), tone: "purple" },
    ];
  },
  totalLabel: (data) => `Grand total (${fmtNumber(count(data), "integer")} estimates)`,
  footnote: "Includes estimates prepared before a job card and the latest estimate of each job card; earlier revisions are left out. Net amount = parts + labour + service − discount.",
};

export const FRONT_OFFICE_CONFIGS = [serviceBookingConfig, jobEstimateRegisterConfig];
