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
  type AppRole,
} from "@/features/auth/roles";

const INVENTORY_ROLES: AppRole[] = [...MANAGE_ROLES, "workshopmanager", "storemanager"];

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
        href: "/appointments",
        icon: CalendarDays,
        roles: CUSTOMER_ROLES,
      },
      {
        label: "Users",
        href: "/users",
        icon: Shield,
        roles: MANAGE_ROLES,
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
        label: "Technicians",
        href: "/technicians",
        icon: UserCog,
        roles: MANAGE_ROLES,
      },
    ],
  },
  {
    label: "Operations",
    roles: FINANCE_ROLES,
    items: [
      {
        label: "Inventory",
        href: "/inventory",
        icon: Package,
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
