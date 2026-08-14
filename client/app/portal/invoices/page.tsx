"use client";

import Link from "next/link";
import { PageHeader } from "@/components/headers/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, SimpleTable } from "@/features/customer-portal/components/portal-ui";
import { StatusBadge } from "@/features/customer-portal/components/StatusBadge";
import { usePortalInvoices } from "@/features/customer-portal/hooks/use-portal";
import { formatCurrency, formatDate } from "@/features/customer-portal/lib/format";

export default function PortalInvoicesPage() {
  const { data, isLoading } = usePortalInvoices();

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Invoices"
        description="Your invoices and payment status"
      />

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : data && data.length > 0 ? (
        <SimpleTable
          headers={["Invoice", "Job", "Status", "Total", "Issued"]}
          rows={data.map((inv) => [
            <Link
              key={inv.id}
              href={`/portal/invoices/${inv.id}`}
              className="font-semibold text-primary hover:underline"
            >
              {inv.invoiceNumber}
            </Link>,
            inv.jobCard?.jobNumber ?? "—",
            <StatusBadge key={`s-${inv.id}`} status={inv.status} />,
            formatCurrency(inv.total),
            formatDate(inv.issuedDate),
          ])}
        />
      ) : (
        <Card>
          <CardContent className="p-5">
            <EmptyState message="No invoices yet" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
