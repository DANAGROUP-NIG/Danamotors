import { NavGroup, NavItem } from "./type";

//icons
import {
  LayoutDashboard,
  Users,
  Bell,
  Car,
  LogOut,
  Package,
  FileText,
  Wrench,
  BarChart2,
  UserCog,
  Settings,
  CalendarDays,
  ClipboardList,
  Shield,
  ReceiptText,
  ShieldCheck,
  Building2,
  ArrowLeftRight,
  Wallet,
  ListChecks,
} from "lucide-react";

//User roles
import {
  MANAGE_ROLES,
  WORKSHOP_ROLES,
  FINANCE_ROLES,
  CUSTOMER_ROLES,
  VEHICLE_ROLES,
  TECHNICIAN_ROLES,
  BRANCH_ROLES,
  TRANSFER_ROLES,
  USER_ROLES,
  SERVICES_MANAGE_ROLES,
  ENQUIRY_READ_ROLES,
  type AppRole,
} from "@/features/auth/roles";

const INVENTORY_ROLES: AppRole[] = [...MANAGE_ROLES, "workshopmanager"];

// ─── Nav structure ─────────────────────────────────────────────────────────────

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Main",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        label: "Customers",
        href: "/customers",
        icon: Users,
        roles: CUSTOMER_ROLES,
      },
      {
        label: "Vehicles",
        href: "/vehicles",
        icon: Car,
        roles: VEHICLE_ROLES,
      },
      {
        label: "Appointments",
        icon: CalendarDays,
        roles: CUSTOMER_ROLES,
        children: [
          { label: "All Appointments", href: "/appointments", icon: CalendarDays, roles: CUSTOMER_ROLES },
          { label: "Triage Queue", href: "/enquiries", icon: ClipboardList, roles: ENQUIRY_READ_ROLES },
        ],
      },
      {
        label: "Users",
        href: "/users",
        icon: Shield,
        roles: USER_ROLES,
      },
      {
        label: "Branches",
        href: "/branches",
        icon: Building2,
        roles: BRANCH_ROLES,
      },
    ],
  },
  {
    label: "Workshop",
    roles: WORKSHOP_ROLES,
    items: [
      {
        label: "Job Cards",
        href: "/job-cards",
        icon: ClipboardList,
        badge: 24,
        roles: WORKSHOP_ROLES,
      },
      {
        label: "Inspection",
        href: "/inspections",
        icon: ShieldCheck,
        roles: TECHNICIAN_ROLES,
      },
      {
        label: "Repairs",
        href: "/repairs",
        icon: Wrench,
        roles: TECHNICIAN_ROLES,
      },
      {
        label: "Services",
        href: "/services",
        icon: ListChecks,
        roles: SERVICES_MANAGE_ROLES,
      },
      {
        label: "Technicians",
        href: "/technicians",
        icon: UserCog,
        roles: MANAGE_ROLES,
      },
    ],
  },
  {
    label: "Operations",
    roles: [...new Set([...FINANCE_ROLES, ...INVENTORY_ROLES])],
    items: [
      {
        label: "Inventory",
        href: "/inventory",
        icon: Package,
        roles: INVENTORY_ROLES,
      },
      {
        label: "Transfers",
        href: "/transfers",
        icon: ArrowLeftRight,
        roles: TRANSFER_ROLES,
      },
      {
        label: "Purchase Requests",
        href: "/purchase-requests",
        icon: ClipboardList,
        roles: INVENTORY_ROLES,
      },
      {
        label: "Purchasing",
        href: "/purchasing",
        icon: ReceiptText,
        roles: FINANCE_ROLES,
      },
      {
        label: "Finance",
        href: "/finance",
        icon: BarChart2,
        roles: FINANCE_ROLES,
      },
      {
        label: "Credit Applications",
        href: "/credit-applications",
        icon: Wallet,
        roles: FINANCE_ROLES,
      },
      {
        label: "Reports",
        href: "/reports",
        icon: FileText,
        roles: FINANCE_ROLES,
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        roles: MANAGE_ROLES,
      },
      {
        label: "Log out",
        href: "/logout",
        icon: LogOut,
      },
    ],
  },
];

export const BOTTOM_NAV: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Vehicles",
    href: "/vehicles",
    icon: Car,
    roles: VEHICLE_ROLES,
  },
  {
    label: "Book",
    href: "/appointments",
    icon: CalendarDays,
    roles: CUSTOMER_ROLES,
  },
  {
    label: "Jobs",
    href: "/job-cards",
    icon: Bell,
    roles: WORKSHOP_ROLES,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    roles: MANAGE_ROLES,
  },
];

// ─── Dashboard Mock & Static Data ─────────────────────────────────────────────

export const REVENUE_DATA = [
  { day: "Mon", value: 1_800_000 },
  { day: "Tue", value: 2_200_000 },
  { day: "Wed", value: 1_950_000 },
  { day: "Thu", value: 3_100_000 },
  { day: "Fri", value: 2_750_000 },
  { day: "Sat", value: 3_456_789 },
  { day: "Sun", value: 2_400_000 },
];

export const JOBS_BY_STATUS = [
  { name: "Checked In", value: 18, color: "#2563eb" },
  { name: "Inspection", value: 14, color: "#7c3aed" },
  { name: "Diagnosis", value: 16, color: "#0ea5e9" },
  { name: "Quotation", value: 20, color: "#f59e0b" },
  { name: "Repair", value: 24, color: "#f97316" },
  { name: "QC", value: 10, color: "#10b981" },
  { name: "Ready", value: 10, color: "#22c55e" },
];

export const TOP_TECHNICIANS = [
  { rank: 1, name: "James Kim", jobs: 34, rate: 92, avatar: "JK" },
  { rank: 2, name: "Michael Brown", jobs: 18, rate: 88, avatar: "MB" },
  { rank: 3, name: "David Wilson", jobs: 16, rate: 85, avatar: "DW" },
  { rank: 4, name: "Robert Fox", jobs: 14, rate: 82, avatar: "RF" },
  { rank: 5, name: "John Carter", jobs: 12, rate: 76, avatar: "JC" },
];

export const SPARKLINES: Record<string, { v: number }[]> = {
  revenue: [
    { v: 1.8 },
    { v: 2.2 },
    { v: 1.9 },
    { v: 3.1 },
    { v: 2.7 },
    { v: 3.4 },
    { v: 3.4 },
  ],
  jobs: [
    { v: 95 },
    { v: 100 },
    { v: 107 },
    { v: 98 },
    { v: 110 },
    { v: 108 },
    { v: 112 },
  ],
  inProgress: [
    { v: 20 },
    { v: 17 },
    { v: 22 },
    { v: 19 },
    { v: 21 },
    { v: 18 },
    { v: 18 },
  ],
  completed: [
    { v: 60 },
    { v: 65 },
    { v: 68 },
    { v: 64 },
    { v: 70 },
    { v: 69 },
    { v: 72 },
  ],
};

// ─── Hero / Landing Static Data ───────────────────────────────────────────────

export const HERO_STATS = [
  { value: "24/7", label: "service updates" },
  { value: "6", label: "clear service stages" },
  { value: "12k+", label: "vehicles supported" },
];

export const HERO_SLIDER_IMAGES = [
  "/bg/hero-1.jpg",
  "/bg/hero-2.jpg",
  "/bg/hero-3.jpg",
  "/bg/hero-5.jpg",
  "/bg/pexels-shvetsa-4315570.jpg",
];

