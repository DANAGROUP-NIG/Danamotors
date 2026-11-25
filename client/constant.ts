import { FRAMEWORK_REPORT_PERMISSIONS, MONTHLY_REPORT_PERMISSIONS } from "@/features/auth/roles";
import { NavGroup, NavItem } from "./type";
import {
  CAMPAIGN_PERMISSIONS,
  CHALLAN_PERMISSIONS,
  INVENTORY_PERMISSIONS,
  LABEL_PERMISSIONS,
  PART_SALE_PERMISSIONS,
  STOCK_AUDIT_PERMISSIONS,
  STOCK_TAKE_PERMISSIONS,
  WARRANTY_PERMISSIONS,
} from "./features/auth/roles";

//icons
import {
  LayoutDashboard,
  Users,
  Bell,
  Car,
  LogOut,
  Package,
  FileText,
  BarChart2,
  UserCog,
  Settings,
  CalendarDays,
  CalendarClock,
  Clock3,
  ClipboardList,
  ClipboardCheck,
  Shield,
  ReceiptText,
  Building2,
  ArrowLeftRight,
  Wallet,
  ListChecks,
  BadgeCheck,
  PackageSearch,
  Ship,
  Truck,
  ShieldAlert,
  Landmark,
  Megaphone,
  ShoppingCart,
  FileBarChart,
  Undo2,
  Fuel,
  RotateCcw,
  FileSearch,
  Database,
  Ban,
  Barcode,
  Repeat2,
  PhoneCall,
  Frown,
  Mail,
  SmilePlus,
  Tags,
} from "lucide-react";

// ─── Nav structure ─────────────────────────────────────────────────────────────
// Every item uses `permissions` — the backend permission strings from
// `server/src/shared/constants/roles.ts`. When a permission is removed
// from the user's role in the DB, the nav item disappears on next page load
// (AuthProvider re-fetches /auth/me → updated permissions[]).

// TODO(issue #96): Parts Reports is absent from this checkout. When its menu,
// page and parts-report API routes are available, gate all three on
// partsreport:read plus each report permission; exclude both store roles.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Main",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        permissions: ["dashboard:read"],
      },
      {
        label: "Customers",
        href: "/customers",
        icon: Users,
        permissions: ["customer:read"],
      },
      {
        label: "Vehicles",
        href: "/vehicles",
        icon: Car,
        permissions: ["vehicle:read"],
      },
      {
        label: "Appointments",
        icon: CalendarDays,
        permissions: ["appointment:read", "enquiry:read"],
        children: [
          {
            label: "Service Appointments",
            href: "/appointments",
            icon: CalendarDays,
            permissions: ["appointment:read"],
          },
          {
            label: "Enquiry Appointments",
            href: "/enquiries",
            icon: ClipboardList,
            permissions: ["enquiry:read"],
          },
        ],
      },
    ],
  },
  {
    label: "Workshop",
    permissions: [
      "jobcard:read",
      "pdi:read",
      "repeatjob:read",
      "jobcard:late-reason:update",
      "csc:case:read",
      "csc:master:read",
      "psf:read",
      "services:read",
      WARRANTY_PERMISSIONS.READ,
      CAMPAIGN_PERMISSIONS.READ,
      ...MONTHLY_REPORT_PERMISSIONS,
      ...FRAMEWORK_REPORT_PERMISSIONS,
      "corporate:manage",
      "financereport:read",
      "report:receipt-register",
      "report:party-ledger",
      "report:party-outstanding",
      "report:party-outstanding-age",
      "report:party-outstanding-bill",
      "report:debit-note-register",
      "report:credit-note-register",
    ],
    items: [
      {
        label: "Job Cards",
        href: "/job-cards",
        icon: ClipboardList,
        permissions: ["jobcard:read"],
      },
      {
        label: "PDI",
        icon: ClipboardCheck,
        permissions: ["pdi:read"],
        children: [
          { label: "PDI Job Cards", href: "/pdi", icon: ClipboardCheck, permissions: ["pdi:read"] },
          { label: "Open PDI", href: "/pdi/new", icon: ClipboardList, permissions: ["pdi:create"] },
          { label: "PDI Requisitions", href: "/pdi/requisitions", icon: Package, permissions: ["pdi:read"] },
          { label: "PDI Returns", href: "/pdi/returns", icon: Package, permissions: ["pdi:read"] },
          { label: "PDI Labour", href: "/pdi/labour-slips", icon: ListChecks, permissions: ["pdi:read"] },
          { label: "PDI Bills", href: "/pdi/bills", icon: FileText, permissions: ["pdi:read", "pdi:bill"] },
        ],
      },
      {
        label: "Repeat Jobs",
        href: "/repeat-jobs",
        icon: Repeat2,
        permissions: ["repeatjob:read"],
      },
      {
        label: "Late Deliveries",
        icon: CalendarClock,
        permissions: ["jobcard:late-reason:update"],
        children: [
          { label: "Promise Date Entry", href: "/late-deliveries/date", icon: CalendarClock, permissions: ["jobcard:late-reason:update"] },
          { label: "Promise Time Entry", href: "/late-deliveries/time", icon: Clock3, permissions: ["jobcard:late-reason:update"] },
        ],
      },
      {
        label: "CSC Follow-up",
        icon: PhoneCall,
        permissions: ["csc:case:read", "csc:master:read"],
        children: [
          { label: "1st Follow-up", href: "/csc/follow-up/first", icon: PhoneCall, permissions: ["csc:case:read"] },
          { label: "2nd Follow-up", href: "/csc/follow-up/second", icon: PhoneCall, permissions: ["csc:case:read"] },
          { label: "Not Visited", href: "/csc/not-visited", icon: CalendarDays, permissions: ["csc:case:read"] },
          { label: "Generate Cases", href: "/csc/generate", icon: ListChecks, permissions: ["csc:case:generate"] },
          { label: "CSC Master", href: "/csc/schedule", icon: Settings, permissions: ["csc:master:read"] },
          { label: "Closure Reasons", href: "/csc/close-reasons", icon: ClipboardList, permissions: ["csc:master:read"] },
        ],
      },
      {
        label: "Post-service Follow-up",
        icon: SmilePlus,
        permissions: ["psf:read", "psf:letter"],
        children: [
          { label: "Follow-up Entry", href: "/psf", icon: PhoneCall, permissions: ["psf:read"] },
          { label: "Follow-up List", href: "/reports/psf-followup-list", icon: ListChecks, permissions: ["psf:read"] },
          { label: "Dissatisfied Customers", href: "/reports/psf-dissatisfied", icon: Frown, permissions: ["report:psf-dissatisfied"] },
          { label: "Follow-up Letters", href: "/reports/psf-letter", icon: Mail, permissions: ["psf:letter"] },
          { label: "Mailing List", href: "/reports/psf-mailing-list", icon: Tags, permissions: ["psf:letter"] },
        ],
      },
      {
        label: "Services",
        href: "/services",
        icon: ListChecks,
        permissions: ["services:read"],
      },
      {
        label: "Warranty",
        href: "/warranty",
        icon: BadgeCheck,
        permissions: [WARRANTY_PERMISSIONS.READ],
      },
      {
        label: "Campaigns",
        href: "/campaigns",
        icon: Megaphone,
        permissions: [CAMPAIGN_PERMISSIONS.READ],
      },
      {
        label: "FPC bulletins",
        href: "/campaigns?type=FPC",
        icon: ClipboardCheck,
        permissions: [CAMPAIGN_PERMISSIONS.READ],
      },
      {
        label: "Reports",
        href: "/reports",
        icon: FileText,
        permissions: [
          ...MONTHLY_REPORT_PERMISSIONS,
          ...FRAMEWORK_REPORT_PERMISSIONS,
          "corporate:manage",
          "financereport:read",
          "report:receipt-register",
          "report:party-ledger",
          "report:party-outstanding",
          "report:party-outstanding-age",
          "report:party-outstanding-bill",
          "report:debit-note-register",
          "report:credit-note-register",
        ],
      },
    ],
  },
  {
    label: "Operations",
    permissions: [
      INVENTORY_PERMISSIONS.SPAREPART_READ,
      INVENTORY_PERMISSIONS.STOCK_READ,
      INVENTORY_PERMISSIONS.TRANSFER_READ,
      INVENTORY_PERMISSIONS.TRANSFER_CANCEL,
      PART_SALE_PERMISSIONS.READ,
      PART_SALE_PERMISSIONS.ORDER,
      STOCK_TAKE_PERMISSIONS.READ,
      STOCK_AUDIT_PERMISSIONS.READ,
    ],
    // Parts first, in the order a part moves: master, query, receive (MIT), count, sell, correct,
    // transfer, report.
    items: [
      {
        label: "Inventory",
        href: "/inventory",
        icon: Package,
        permissions: [
          INVENTORY_PERMISSIONS.SPAREPART_READ,
          INVENTORY_PERMISSIONS.STOCK_READ,
        ],
      },
      {
        label: "Part Query",
        href: "/inventory/part-query",
        icon: PackageSearch,
        permissions: [
          INVENTORY_PERMISSIONS.SPAREPART_READ,
          INVENTORY_PERMISSIONS.STOCK_READ,
        ],
      },
      {
        label: "Barcode Labels",
        href: "/inventory/barcode-labels",
        icon: Barcode,
        permissions: [LABEL_PERMISSIONS.PRINT],
      },
      {
        label: "MIT",
        href: "/inventory/mobis-receipts",
        icon: Ship,
        permissions: [INVENTORY_PERMISSIONS.STOCK_READ],
      },
      {
        label: "MRN",
        href: "/inventory/mrn",
        icon: Truck,
        permissions: [INVENTORY_PERMISSIONS.STOCK_READ],
      },
      {
        label: "Shortage Approvals",
        href: "/inventory/discrepancies",
        icon: ShieldAlert,
        permissions: [INVENTORY_PERMISSIONS.STOCK_DISCREPANCY_APPROVE],
      },
      {
        label: "Stock Taking",
        href: "/inventory/stock-taking",
        icon: ClipboardCheck,
        permissions: [STOCK_TAKE_PERMISSIONS.READ],
      },
      {
        label: "Stock Audit",
        href: "/inventory/stock-audit",
        icon: FileSearch,
        permissions: [STOCK_AUDIT_PERMISSIONS.READ],
      },
      {
        label: "Part Sale",
        href: "/part-sale/orders",
        icon: ShoppingCart,
        permissions: [PART_SALE_PERMISSIONS.READ, CHALLAN_PERMISSIONS.READ],
        children: [
          {
            label: "Customer Orders",
            href: "/part-sale/orders",
            icon: ClipboardList,
            permissions: [PART_SALE_PERMISSIONS.READ],
          },
          {
            label: "Counter Sales",
            href: "/part-sale/counter-sales",
            icon: ReceiptText,
            permissions: [PART_SALE_PERMISSIONS.READ],
          },
          {
            label: "Sale Returns",
            href: "/part-sale/returns",
            icon: Undo2,
            permissions: [PART_SALE_PERMISSIONS.READ],
          },
          {
            label: "Dispatch Challans",
            href: "/part-sale/challans",
            icon: Fuel,
            permissions: [CHALLAN_PERMISSIONS.READ],
          },
          {
            label: "Challan Returns",
            href: "/part-sale/challan-returns",
            icon: RotateCcw,
            permissions: [CHALLAN_PERMISSIONS.READ],
          },
        ],
      },
      {
        label: "Data Management",
        href: "/data-management",
        icon: Database,
        permissions: [
          PART_SALE_PERMISSIONS.ORDER,
          INVENTORY_PERMISSIONS.TRANSFER_CANCEL,
          INVENTORY_PERMISSIONS.STOCK_READ,
        ],
        children: [
          {
            label: "CPO Cancellation",
            href: "/data-management/cpo-cancellation",
            icon: Ban,
            permissions: [PART_SALE_PERMISSIONS.ORDER],
          },
          {
            label: "Indent From Branch Cancellation",
            href: "/data-management/indent-inward-cancellation",
            icon: Ban,
            permissions: [INVENTORY_PERMISSIONS.TRANSFER_CANCEL],
          },
          {
            label: "Indent To Branch Cancellation",
            href: "/data-management/indent-outward-cancellation",
            icon: Ban,
            permissions: [INVENTORY_PERMISSIONS.TRANSFER_CANCEL],
          },
          {
            label: "Part List",
            href: "/parts-reports/current-stock",
            icon: FileBarChart,
            permissions: [INVENTORY_PERMISSIONS.STOCK_READ],
          },
        ],
      },
      {
        label: "Transfers",
        href: "/transfers",
        icon: ArrowLeftRight,
        permissions: [INVENTORY_PERMISSIONS.TRANSFER_READ],
      },
      {
        label: "Parts Reports",
        href: "/parts-reports",
        icon: FileBarChart,
        // Counter-sale, transfer and stock registers; each report checks its own permission.
        permissions: [
          PART_SALE_PERMISSIONS.READ,
          INVENTORY_PERMISSIONS.TRANSFER_READ,
          INVENTORY_PERMISSIONS.STOCK_READ,
          STOCK_TAKE_PERMISSIONS.READ,
          STOCK_AUDIT_PERMISSIONS.READ,
        ],
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        label: "Finance",
        href: "/finance",
        icon: BarChart2,
        permissions: [
          "invoice:read",
          "payment:read",
          "receipt:create",
          "receipt:adjust",
          "outstanding:recalculate",
          "letter:outstanding",
          "debitnote:read",
          "creditnote:read",
          "debitnote:create",
          "creditnote:create",
        ],
        children: [
          {
            label: "Overview",
            href: "/finance",
            icon: BarChart2,
            permissions: [
              "invoice:read",
              "payment:read",
              "receipt:create",
              "receipt:adjust",
              "outstanding:recalculate",
              "letter:outstanding",
              "debitnote:read",
              "creditnote:read",
              "debitnote:create",
              "creditnote:create",
            ],
          },
          {
            label: "Debit Notes",
            href: "/finance/receipts/debit-notes",
            icon: ReceiptText,
            permissions: ["debitnote:read", "debitnote:create"],
          },
          {
            label: "Credit Notes",
            href: "/finance/receipts/credit-notes",
            icon: ReceiptText,
            permissions: ["creditnote:read", "creditnote:create"],
          },
          {
            label: "Update Outstanding",
            href: "/finance/receipts/update-outstanding",
            icon: Wallet,
            permissions: ["outstanding:recalculate"],
          },
          {
            label: "Outstanding Letters",
            href: "/finance/receipts/outstanding-letters",
            icon: Wallet,
            permissions: ["letter:outstanding"],
          },
          {
            label: "Advance Adjustment",
            href: "/finance/receipts/advance-adjustment",
            icon: Wallet,
            permissions: ["receipt:adjust"],
          },
        ],
      },
      {
        label: "Tally",
        href: "/finance/tally",
        icon: Landmark,
        permissions: ["tally:post", "tally:import"],
      },
      {
        label: "Credit Applications",
        href: "/credit-applications",
        icon: Wallet,
        permissions: ["credit:application:create"],
      },
    ],
  },
  {
    label: "Admin",
    permissions: [
      "branch:read",
      "employee:read",
      "user:read",
      "workshop:read",
      "labour-item:read",
      "role:read",
    ],
    items: [
      {
        label: "Branches",
        href: "/branches",
        icon: Building2,
        permissions: ["branch:read"],
      },
      {
        label: "Employees",
        href: "/employees",
        icon: Users,
        permissions: ["employee:read"],
      },
      {
        label: "Users",
        href: "/users",
        icon: Shield,
        permissions: ["user:read"],
      },
      {
        label: "Technicians",
        href: "/technicians",
        icon: UserCog,
        permissions: ["workshop:read"],
      },
      {
        label: "Labour Catalogue",
        href: "/labour-catalogue",
        icon: ListChecks,
        permissions: ["labour-item:read"],
      },
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        permissions: ["role:read"],
      },
    ],
  },
  // No heading: log out sits on its own at the bottom.
  {
    items: [
      {
        label: "Log out",
        href: "/logout",
        icon: LogOut,
      },
    ],
  },
];

export const BOTTOM_NAV: NavItem[] = [
  {
    label: "Home",
    href: "/dashboard",
    icon: LayoutDashboard,
    permissions: ["dashboard:read"],
  },
  {
    label: "Vehicles",
    href: "/vehicles",
    icon: Car,
    permissions: ["vehicle:read"],
  },
  {
    label: "Book",
    href: "/appointments",
    icon: CalendarDays,
    permissions: ["appointment:read"],
  },
  {
    label: "Jobs",
    href: "/job-cards",
    icon: Bell,
    permissions: ["jobcard:read"],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    permissions: ["role:read"],
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
