"use client";
import { useState } from "react";

//components
import SideNav from "@/components/nagivation/SideNav";
import MainHeader from "@/components/headers/MainHeader";
import MobileNav from "@/components/nagivation/MobileNav";
import { RouteGuard } from "@/components/ui/RouteGuard";
import {
  FINANCE_ROLES,
  WORKSHOP_ROLES,
  CUSTOMER_ROLES,
  VEHICLE_ROLES,
  TECHNICIAN_ROLES,
  BRANCH_ROLES,
  TRANSFER_ROLES,
  USER_ROLES,
  MANAGE_ROLES,
  type AppRole,
} from "@/features/auth/roles";

const ROUTE_ROLES: Record<string, AppRole[]> = {
  "/customers": CUSTOMER_ROLES,
  "/vehicles": VEHICLE_ROLES,
  "/appointments": CUSTOMER_ROLES,
  "/users": USER_ROLES,
  "/branches": BRANCH_ROLES,
  "/job-cards": WORKSHOP_ROLES,
  "/inspections": TECHNICIAN_ROLES,
  "/repairs": TECHNICIAN_ROLES,
  "/technicians": MANAGE_ROLES,
  "/inventory": [...MANAGE_ROLES, "workshopmanager"],
  "/transfers": TRANSFER_ROLES,
  "/purchase-requests": [...MANAGE_ROLES, "workshopmanager"],
  "/purchasing": FINANCE_ROLES,
  "/finance": FINANCE_ROLES,
  "/reports": FINANCE_ROLES,
  "/payments": FINANCE_ROLES,
  "/quotations": WORKSHOP_ROLES,
  "/settings": MANAGE_ROLES,
};

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // // Mobile drawer state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f0f4f8]">
      {/* ── Mobile backdrop ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <SideNav sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      {/* ── Right column ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f0f4f8] text-[#0f172a]">
        {/* ── Top header ──────────────────────────────────────────── */}
        <MainHeader setSidebarOpen={setSidebarOpen} />

        {/* ── Page content ────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto" id="main-content">
          <RouteGuard routeRoles={ROUTE_ROLES}>{children}</RouteGuard>
        </main>

        {/* ── Mobile bottom nav ───────────────────────────────────── */}
        <MobileNav />
      </div>
    </div>
  );
}
