"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/headers/page-header";
import {
  EmptyState,
  SimpleTable,
} from "@/features/customer-portal/components/portal-ui";
import { StatusBadge } from "@/features/customer-portal/components/StatusBadge";
import {
  usePortalCredit,
  usePortalCreditApplications,
} from "@/features/customer-portal/hooks/use-portal";
import {
  formatCurrency,
  formatDate,
} from "@/features/customer-portal/lib/format";

export default function PortalCreditPage() {
  const { data: credit, isLoading: loadingCredit } = usePortalCredit();
  const { data: applications, isLoading: loadingApplications } =
    usePortalCreditApplications();

  const balance = credit?.customer.creditBalance ?? 0;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="My Credit"
        description="Your credit balance and how it has been used"
      />

      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="inline-grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Wallet className="size-6" />
          </span>
          <p className="text-sm text-muted-foreground">Available credit</p>
          <p className="text-4xl font-bold text-primary">
            {formatCurrency(balance)}
          </p>
          <p className="text-sm text-muted-foreground">
            Credit approved by Dana Motors can be applied to your invoices.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Credit history</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCredit ? (
              <p className="py-6 text-sm text-muted-foreground">Loading…</p>
            ) : !credit || credit.transactions.length === 0 ? (
              <EmptyState message="No credit activity yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Description</th>
                      <th className="px-3 py-2 font-semibold">Amount</th>
                      <th className="px-3 py-2 font-semibold">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credit.transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="px-3 py-3 text-muted-foreground">
                          {formatDate(tx.createdAt)}
                        </td>
                        <td className="px-3 py-3">{tx.description ?? "—"}</td>
                        <td
                          className={`px-3 py-3 font-medium ${
                            tx.amount < 0
                              ? "text-red-600"
                              : "text-green-600"
                          }`}
                        >
                          {tx.amount < 0 ? "−" : "+"}
                          {formatCurrency(Math.abs(tx.amount))}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {formatCurrency(tx.balanceAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Credit applications</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingApplications ? (
              <p className="py-6 text-sm text-muted-foreground">Loading…</p>
            ) : !applications || applications.length === 0 ? (
              <EmptyState message="No credit applications yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Invoice</th>
                      <th className="px-3 py-2 font-semibold">Amount</th>
                      <th className="px-3 py-2 font-semibold">Requested</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((app) => (
                      <tr
                        key={app.id}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="px-3 py-3">
                          {app.invoice ? (
                            <Link
                              href={`/portal/invoices/${app.invoice.id}`}
                              className="font-semibold text-primary hover:underline"
                            >
                              {app.invoice.invoiceNumber}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3 font-medium">
                          {formatCurrency(app.amount)}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {formatDate(app.createdAt)}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={app.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
