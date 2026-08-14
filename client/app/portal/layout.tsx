"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import {
  Car,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  User,
  Wallet,
} from "lucide-react";

//types
import type { NavGroup } from "@/type";

//components
import SideNav from "@/components/nagivation/SideNav";
import { PortalRouteGuard } from "@/features/customer-portal/components/PortalRouteGuard";

//hooks
import { usePortalProfile } from "@/features/customer-portal/hooks/use-portal";

const PORTAL_NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/portal", icon: LayoutDashboard }],
  },
  {
    label: "Service",
    items: [
      { label: "My Vehicles", href: "/portal/vehicles", icon: Car },
      { label: "Service History", href: "/portal/service-history", icon: ClipboardList },
      { label: "Appointments", href: "/portal/appointments", icon: CalendarDays },
      { label: "Invoices", href: "/portal/invoices", icon: FileText },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Profile", href: "/portal/profile", icon: User },
      { label: "My Credit", href: "/portal/credit", icon: Wallet },
      { label: "Log out", href: "/logout", icon: LogOut },
    ],
  },
];

const PORTAL_SIDEBAR_KEY = "danamotors-portal-sidebar-collapsed";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: profile } = usePortalProfile();

  const branch = profile?.branch ?? null;

  return (
    <PortalRouteGuard>
      <div className="flex h-screen overflow-hidden bg-[#f0f4f8]">
        <SideNav
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          navGroups={PORTAL_NAV_GROUPS}
          branchSource="props"
          branch={{
            branches: branch ? [branch] : [],
            activeBranch: branch,
            isLoading: !profile,
            canSwitch: false,
            canSeeAll: false,
          }}
          collapsedKey={PORTAL_SIDEBAR_KEY}
          roleLabel="Customer"
          exactRoot="/portal"
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden text-[#0f172a]">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-white px-4 lg:px-6">
            <button
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </button>
            <div>
              <p className="text-sm font-bold">Dana Motors — Customer Portal</p>
              <p className="text-xs text-muted-foreground">
                Your vehicles, service and invoices in one place
              </p>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto" id="portal-main-content">
            {children}
          </main>
        </div>
      </div>
    </PortalRouteGuard>
  );
}
