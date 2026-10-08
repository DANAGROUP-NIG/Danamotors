"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { PageHeader } from "@/components/headers/page-header";

const FINANCE_CARDS = [
  {
    title: "Quotations",
    href: "/quotations",
    description: "Service cost estimates awaiting customer approval.",
  },
  {
    title: "Invoices",
    href: "/invoices",
    description: "Customer invoices for completed services.",
  },
  {
    title: "Payments",
    href: "/payments",
    description: "Payment transactions and receipts.",
  },
  {
    title: "Reports",
    href: "/reports",
    description: "Revenue, expense, and profitability reports.",
  },
];

export function FinancePage() {
  const { hasPermission } = useAuth();
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Finance"
        description="Revenue, invoicing, and payment management."
      />
      <section className="rounded-xl border bg-background p-5"><h2 className="font-semibold">Receipts</h2><div className="mt-3 flex flex-wrap gap-4 text-sm">{hasPermission("receipt:create") && <Link className="font-medium text-primary hover:underline" href="/payments">Payment receipt</Link>}{hasPermission("receipt:adjust") && <Link className="font-medium text-primary hover:underline" href="/finance/receipts/advance-adjustment">Advance adjustment</Link>}</div></section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FINANCE_CARDS.map(({ title, href, description }) => (
          <Link
            key={title}
            href={href}
            className="group rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm transition hover:border-primary/30 hover:shadow-md"
          >
            <p className="font-semibold text-foreground group-hover:text-primary">
              {title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            <span className="mt-4 block text-sm font-semibold text-primary">
              Open →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
