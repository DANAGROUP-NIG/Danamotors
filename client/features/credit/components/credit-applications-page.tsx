"use client";

import { useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { FINANCE_ROLES } from "@/features/auth/roles";
import { useCreditApplications } from "../hooks/use-credit";
import type { CreditApplication } from "../types/credit.types";
import { CreateCreditApplicationModal } from "./CreateCreditApplicationModal";

const STATUS_TABS = ["All", "Pending", "Approved", "Declined"] as const;

const STATUS_STYLES: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700",
  Approved: "bg-green-100 text-green-700",
  Declined: "bg-red-100 text-red-600",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amount);
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

export function CreditApplicationsPage() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canCreate = hasAccess(FINANCE_ROLES);

  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("All");
  const [modalOpen, setModalOpen] = useState(false);

  const { data, isLoading } = useCreditApplications({
    branchId: activeBranch?.id,
    status: tab === "All" ? undefined : tab,
  });

  const applications = data ?? [];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Credit applications"
        description="Requests to apply a customer's credit to an approved invoice. Customers decide on the portal."
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="size-4" />
              New application
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((status) => (
          <button
            key={status}
            onClick={() => setTab(status)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              tab === status
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {status}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : applications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Wallet className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No credit applications{tab !== "All" ? ` with status "${tab}"` : ""} yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Requested by</th>
                    <th className="px-4 py-3 font-semibold">Requested</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <CreditApplicationRow key={app.id} application={app} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateCreditApplicationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

function CreditApplicationRow({
  application,
}: {
  application: CreditApplication;
}) {
  const statusClass =
    STATUS_STYLES[application.status] ?? "bg-gray-100 text-gray-600";

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-4 py-3">
        <p className="font-medium">
          {application.customer.firstName} {application.customer.lastName}
        </p>
        <p className="text-xs text-muted-foreground">{application.customer.email}</p>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {application.invoice.invoiceNumber}
        <p className="text-xs">
          status: {application.invoice.status} · {formatCurrency(application.invoice.total)}
        </p>
      </td>
      <td className="px-4 py-3 font-semibold">
        {formatCurrency(application.amount)}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {application.requestedBy.firstName} {application.requestedBy.lastName}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {formatDate(application.createdAt)}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            statusClass,
          )}
        >
          {application.status}
        </span>
      </td>
      <td className="max-w-[220px] px-4 py-3 text-muted-foreground">
        <span className="line-clamp-2">{application.comments ?? "—"}</span>
      </td>
    </tr>
  );
}
