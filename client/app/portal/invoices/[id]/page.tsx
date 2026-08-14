"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/features/customer-portal/components/StatusBadge";
import { EmptyState, SimpleTable } from "@/features/customer-portal/components/portal-ui";
import { usePortalInvoice, usePortalCredit } from "@/features/customer-portal/hooks/use-portal";
import { CreditApplicationActions } from "@/features/customer-portal/components/CreditApplicationActions";
import { formatCurrency, formatDate } from "@/features/customer-portal/lib/format";

export default function PortalInvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: invoice, isLoading } = usePortalInvoice(params.id);
  const { data: credit } = usePortalCredit();
  const creditBalance = credit?.customer.creditBalance ?? 0;
  const pendingApplications =
    invoice?.creditApplications?.filter((a) => a.status === "Pending") ?? [];

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      </div>
    );
  }

  if (!invoice) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title={invoice.invoiceNumber}
          description={
            invoice.jobCard
              ? `Job ${invoice.jobCard.jobNumber} · ${
                  invoice.jobCard.vehicle
                    ? `${invoice.jobCard.vehicle.make ?? ""} ${invoice.jobCard.vehicle.model ?? ""}`.trim()
                    : ""
                }`
              : undefined
          }
        />
        <Button variant="outline" size="sm" asChild>
          <Link href="/portal/invoices">Back to invoices</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Invoice summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="mt-1">
                  <StatusBadge status={invoice.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="mt-1 font-medium">{formatCurrency(invoice.subtotal)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="mt-1 font-medium">{formatCurrency(invoice.tax)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total</dt>
                <dd className="mt-1 text-lg font-bold text-primary">
                  {formatCurrency(invoice.total)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Issued</dt>
                <dd className="mt-1 font-medium">{formatDate(invoice.issuedDate)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Due date</dt>
                <dd className="mt-1 font-medium">{formatDate(invoice.dueDate)}</dd>
              </div>
            </dl>
            {invoice.notes && (
              <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {invoice.notes}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent>
            {invoice.payments.length > 0 ? (
              <SimpleTable
                headers={["Amount", "Method", "Date"]}
                rows={invoice.payments.map((p) => [
                  formatCurrency(p.amount),
                  p.method ?? "—",
                  formatDate(p.paymentDate),
                ])}
              />
            ) : (
              <EmptyState message="No payments recorded yet" />
            )}
          </CardContent>
        </Card>
      </div>

      {invoice.receipts && invoice.receipts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleTable
              headers={["Reference", "Amount", "Issued"]}
              rows={invoice.receipts.map((r) => [
                r.reference ?? "—",
                formatCurrency(r.amount),
                formatDate(r.issuedAt),
              ])}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Credit applications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Available credit:{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(creditBalance)}
            </span>
            . Approving an application applies that amount to this invoice and
            deducts it from your credit balance.
          </p>
          {invoice.creditApplications.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Amount</th>
                    <th className="px-3 py-2 font-semibold">Requested</th>
                    <th className="px-3 py-2 font-semibold">Comments</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.creditApplications.map((app) => (
                    <tr key={app.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-3 font-semibold">
                        {formatCurrency(app.amount)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {formatDate(app.createdAt)}
                      </td>
                      <td className="max-w-[220px] px-3 py-3 text-muted-foreground">
                        {app.comments ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <CreditApplicationActions application={app} />
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {app.decisionDate ? formatDate(app.decisionDate) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="No credit applications for this invoice yet" />
          )}
          {pendingApplications.length === 0 &&
            invoice.creditApplications.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                You have no pending credit applications for this invoice.
              </p>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
