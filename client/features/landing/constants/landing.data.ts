import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarDays,
  ClipboardCheck,
  FileText,
  Package,
  ShieldCheck,
  Wrench,
} from "lucide-react";

export const revenueData = [
  { day: "Mon", revenue: 32 },
  { day: "Tue", revenue: 48 },
  { day: "Wed", revenue: 41 },
  { day: "Thu", revenue: 68 },
  { day: "Fri", revenue: 54 },
  { day: "Sat", revenue: 72 },
  { day: "Sun", revenue: 39 },
];

export const statusData = [
  { name: "Booked", value: 18, color: "#2563eb" },
  { name: "Checked In", value: 14, color: "#60a5fa" },
  { name: "Inspection", value: 16, color: "#22c55e" },
  { name: "Repair", value: 24, color: "#f59e0b" },
  { name: "Ready", value: 10, color: "#34d399" },
  { name: "Follow-up", value: 8, color: "#ef4444" },
];

export const features = [
  {
    title: "Easy Service Booking",
    copy: "Choose a service, select a date, and send your vehicle details to Dana before you arrive.",
    icon: CalendarDays,
  },
  {
    title: "Vehicle Health Checks",
    copy: "Dana technicians inspect key systems and share clear findings before repair work begins.",
    icon: ShieldCheck,
  },
  {
    title: "Repair Tracking",
    copy: "Follow check-in, diagnosis, approval, repair, quality check, and pickup from one customer view.",
    icon: Wrench,
  },
  {
    title: "Genuine Parts Support",
    copy: "Get transparent part recommendations, availability updates, and replacement guidance from Dana.",
    icon: Package,
  },
  {
    title: "Service Estimates",
    copy: "Review inspection notes, service recommendations, and cost estimates before approving the job.",
    icon: FileText,
  },
  {
    title: "Service History",
    copy: "Keep a clean record of repairs, inspections, mileage, parts, and pickup details for every vehicle.",
    icon: ClipboardCheck,
  },
];

export const workflow = [
  "Book",
  "Check In",
  "Inspect",
  "Approve",
  "Repair",
  "Pick Up",
];

export type ServiceFeature = {
  feature: string;
  routine: string;
  diagnostic: string;
  repair: string;
};

export const serviceFeatures: ServiceFeature[] = [
  { feature: "Vehicle inspection", routine: "Basic", diagnostic: "Advanced", repair: "Full" },
  { feature: "Technician report", routine: "Included", diagnostic: "Included", repair: "Included" },
  { feature: "Parts recommendation", routine: "As needed", diagnostic: "As needed", repair: "Included" },
  { feature: "Customer approval flow", routine: "Included", diagnostic: "Included", repair: "Included" },
  { feature: "Pickup readiness update", routine: "Included", diagnostic: "Included", repair: "Included" },
];

export const serviceColumns: ColumnDef<ServiceFeature>[] = [
  { accessorKey: "feature", header: "What you get" },
  { accessorKey: "routine", header: "Routine Service" },
  { accessorKey: "diagnostic", header: "Diagnostics" },
  { accessorKey: "repair", header: "Repairs" },
];
