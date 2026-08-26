"use client";
import { useState } from "react";

//components
import SideNav from "@/components/nagivation/SideNav";
import MainHeader from "@/components/headers/MainHeader";
import MobileNav from "@/components/nagivation/MobileNav";
import { RouteGuard } from "@/components/ui/RouteGuard";

//constants
import { NAV_GROUPS } from "@/constant";

const ROUTE_PERMISSIONS: Record<string, string[]> = {
  "/customers": ["customer:read"],
  "/vehicles": ["vehicle:read"],
  "/appointments": ["appointment:read"],
  "/enquiries": ["customer:read"],
  "/users": ["user:read"],
  "/branches": ["branch:read"],
  "/job-cards": ["jobcard:read"],
  "/inspections": ["inspection:read"],
  "/repairs": ["jobcard:update", "workshop:read"],
  "/technicians": ["user:read"],
  "/inventory": ["sparepart:read", "stock:read"],
  "/transfers": ["transfer:read"],
  "/purchase-requests": ["purchaserequest:read"],
  "/purchasing": ["invoice:read", "payment:read"],
  "/finance": ["invoice:read"],
  "/credit-applications": ["credit:application:create"],
  "/reports": ["financereport:read"],
  "/payments": ["payment:read"],
  "/quotations": ["jobcard:read"],
  "/services": ["services:read"],
  "/settings": ["role:read"],
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
      <SideNav
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        navGroups={NAV_GROUPS}
      />

      {/* ── Right column ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f0f4f8] text-[#0f172a]">
        {/* ── Top header ──────────────────────────────────────────── */}
        <MainHeader setSidebarOpen={setSidebarOpen} />

        {/* ── Page content ────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto" id="main-content">
          <RouteGuard routePermissions={ROUTE_PERMISSIONS}>{children}</RouteGuard>
        </main>

        {/* ── Mobile bottom nav ───────────────────────────────────── */}
        <MobileNav />
      </div>
    </div>
  );
}
