"use client";
import { useState } from "react";

//components
import SideNav from "@/components/nagivation/SideNav";
import MainHeader from "@/components/headers/MainHeader";
import MobileNav from "@/components/nagivation/MobileNav";

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
          {children}
        </main>

        {/* ── Mobile bottom nav ───────────────────────────────────── */}
        <MobileNav />
      </div>
    </div>
  );
}
