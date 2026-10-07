import { CalendarDays } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/table-components/StatusBadge";
import { REPORT_PERMISSIONS } from "@/features/auth/roles";
import { fmtMoney, fmtNumber } from "../lib/report-format";
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

export const FRONT_OFFICE_CONFIGS = [serviceBookingConfig];
