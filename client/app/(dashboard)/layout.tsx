"use client";
import { useState } from "react";

//components
import SideNav from "@/components/nagivation/SideNav";
import MainHeader from "@/components/headers/MainHeader";
import MobileNav from "@/components/nagivation/MobileNav";
import { RouteGuard } from "@/components/ui/RouteGuard";

//constants
import { NAV_GROUPS } from "@/constant";
import { CAMPAIGN_PERMISSIONS, INVENTORY_PERMISSIONS, PART_SALE_PERMISSIONS, STOCK_AUDIT_PERMISSIONS, STOCK_TAKE_PERMISSIONS, WARRANTY_PERMISSIONS } from "@/features/auth/roles";

import { MONTHLY_REPORT_PERMISSIONS } from "@/features/auth/roles";
import { MONTHLY_REPORTS } from "@/features/reports/monthly-config";

const ROUTE_PERMISSIONS: Record<string, string[]> = {
  "/dashboard": ["dashboard:read"],
  "/customers": ["customer:read"],
  "/vehicles": ["vehicle:read"],
  "/appointments": ["appointment:read"],
  "/enquiries": ["enquiry:read"],
  "/users": ["user:read"],
  "/branches": ["branch:read"],
  "/job-cards/new": ["jobcard:create"],
  "/job-cards": ["jobcard:read"],
  "/invoices": ["invoice:read"],
  "/labour-catalogue": ["labour-item:read"],
  "/inspections": ["inspection:read"],
  "/repairs": ["jobcard:update", "workshop:read"],
  "/technicians": ["workshop:read"],
  "/inventory/part-query": [INVENTORY_PERMISSIONS.STOCK_READ],
  "/inventory/mobis-receipts/new": [INVENTORY_PERMISSIONS.STOCK_UPDATE],
  "/inventory/mobis-receipts": [INVENTORY_PERMISSIONS.STOCK_READ],
  "/inventory/vendor-receipts/new": [INVENTORY_PERMISSIONS.STOCK_UPDATE],
  "/inventory/vendor-receipts": [INVENTORY_PERMISSIONS.STOCK_READ],
  "/inventory/stock-taking": [STOCK_TAKE_PERMISSIONS.READ],
  "/inventory/stock-audit": [STOCK_AUDIT_PERMISSIONS.READ],
  "/inventory": [
    INVENTORY_PERMISSIONS.SPAREPART_READ,
    INVENTORY_PERMISSIONS.STOCK_READ,
  ],
  "/inventory/": [
    INVENTORY_PERMISSIONS.SPAREPART_READ,
    INVENTORY_PERMISSIONS.STOCK_READ,
  ],
  // More specific paths must come first: the guard uses the first prefix that matches.
  "/transfers/new": [INVENTORY_PERMISSIONS.TRANSFER_CREATE],
  "/transfers": [INVENTORY_PERMISSIONS.TRANSFER_READ],
  "/data-management/cpo-cancellation": [PART_SALE_PERMISSIONS.ORDER],
  "/data-management/indent-": [INVENTORY_PERMISSIONS.TRANSFER_CANCEL],
  "/data-management": [PART_SALE_PERMISSIONS.ORDER, INVENTORY_PERMISSIONS.TRANSFER_CANCEL, INVENTORY_PERMISSIONS.STOCK_READ],
  "/purchase-requests": [INVENTORY_PERMISSIONS.PURCHASEREQUEST_READ],
  "/purchasing": ["invoice:read", "payment:read"],
  "/finance/receipts/update-outstanding": ["outstanding:recalculate"],
  "/finance/receipts/outstanding-letters": ["letter:outstanding"],
  "/finance/receipts/debit-notes": ["debitnote:read", "debitnote:create"],
  "/finance/receipts/credit-notes": ["creditnote:read", "creditnote:create"],
  "/finance/receipts/advance-adjustment": ["receipt:adjust"],
  "/finance/tally": ["tally:post", "tally:import"],
  "/finance": ["invoice:read","payment:read","receipt:create","receipt:adjust","outstanding:recalculate","letter:outstanding","debitnote:read","creditnote:read","debitnote:create","creditnote:create"],
  "/credit-applications": ["credit:application:create"],
  "/reports/billing-settings": ["role:permission:update"],
  "/reports/corporate-groups": ["corporate:manage"],
  ...Object.fromEntries(MONTHLY_REPORTS.map(r=>["/reports/"+r.slug,["report:"+r.slug]])),
  "/reports/finance/receipt-register": ["report:receipt-register"],
  "/reports/finance/debit-note-register": ["report:debit-note-register"],
  "/reports/finance/credit-note-register": ["report:credit-note-register"],
  "/reports/finance/party-ledger": ["report:party-ledger"],
  "/reports/finance/party-outstanding-age": ["report:party-outstanding-age"],
  "/reports/finance/party-outstanding-bill": ["report:party-outstanding-bill"],
  "/reports/finance/party-outstanding": ["report:party-outstanding"],
  "/reports": [...MONTHLY_REPORT_PERMISSIONS, "corporate:manage", "financereport:read", "report:receipt-register", "report:party-ledger", "report:party-outstanding", "report:party-outstanding-age", "report:party-outstanding-bill", "report:debit-note-register", "report:credit-note-register"],
  "/payments": ["payment:read"],
  "/quotations": ["jobcard:read"],
  "/services": ["services:read"],
  "/warranty/settings": [WARRANTY_PERMISSIONS.SETTINGS],
  "/warranty": [WARRANTY_PERMISSIONS.READ],
  "/campaigns/new": [CAMPAIGN_PERMISSIONS.CREATE],
  "/campaigns": [CAMPAIGN_PERMISSIONS.READ],
  "/settings/party-reports": ["role:read", "report:party-outstanding-age"],
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
    // Printing: the page content alone, on white, flowing over as many pages as it needs.
    <div className="flex h-screen overflow-hidden bg-[#f0f4f8] print:block print:h-auto print:overflow-visible print:bg-white">
      {/* ── Mobile backdrop ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div className="contents print:hidden">
        <SideNav
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          navGroups={NAV_GROUPS}
        />
      </div>

      {/* ── Right column ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f0f4f8] text-[#0f172a] print:block print:overflow-visible print:bg-white">
        {/* ── Top header ──────────────────────────────────────────── */}
        <div className="contents print:hidden">
          <MainHeader setSidebarOpen={setSidebarOpen} />
        </div>

        {/* ── Page content ────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto print:overflow-visible" id="main-content">
          <RouteGuard routePermissions={ROUTE_PERMISSIONS}>{children}</RouteGuard>
        </main>

        {/* ── Mobile bottom nav ───────────────────────────────────── */}
        <div className="contents print:hidden">
          <MobileNav />
        </div>
      </div>
    </div>
  );
}
