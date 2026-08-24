import {
  Bell,
  CalendarClock,
  Wrench,
  ArrowLeftRight,
  BadgeCheck,
  Truck,
  PackageCheck,
  ShoppingCart,
  AlertTriangle,
  FileText,
  CircleDollarSign,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const NOTIFICATION_TYPE_STYLES: Record<
  string,
  { icon: LucideIcon; classes: string }
> = {
  APPOINTMENT_BOOKED: {
    icon: CalendarClock,
    classes: "bg-blue-50 text-blue-600",
  },
  JOB_ASSIGNED: {
    icon: Wrench,
    classes: "bg-amber-50 text-amber-600",
  },
  TRANSFER_REQUESTED: {
    icon: ArrowLeftRight,
    classes: "bg-sky-50 text-sky-600",
  },
  TRANSFER_APPROVED: {
    icon: BadgeCheck,
    classes: "bg-green-50 text-green-600",
  },
  TRANSFER_DISPATCHED: {
    icon: Truck,
    classes: "bg-indigo-50 text-indigo-600",
  },
  TRANSFER_RECEIVED: {
    icon: PackageCheck,
    classes: "bg-emerald-50 text-emerald-600",
  },
  PURCHASE_REQUEST_CREATED: {
    icon: ShoppingCart,
    classes: "bg-purple-50 text-purple-600",
  },
  LOW_STOCK: {
    icon: AlertTriangle,
    classes: "bg-red-50 text-red-600",
  },
  ESTIMATE_CREATED: {
    icon: FileText,
    classes: "bg-teal-50 text-teal-600",
  },
  INVOICE_PAID: {
    icon: CircleDollarSign,
    classes: "bg-green-50 text-green-700",
  },
};

export function getNotificationTypeStyle(type: string) {
  return (
    NOTIFICATION_TYPE_STYLES[type] ?? {
      icon: Bell,
      classes: "bg-slate-100 text-slate-500",
    }
  );
}

export function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
