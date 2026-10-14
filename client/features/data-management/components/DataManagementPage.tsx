"use client";

import Link from "next/link";
import { Ban, FileBarChart } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { CANCELLATION_KINDS, type CancellationKind } from "../lib/order-cancellation";

const cardCls = "flex gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-primary/40 hover:shadow-sm";

/** Legacy Data Management menu: order cancellation and the part list. */
export function DataManagementPage() {
  const { hasPermission } = useAuth();
  const kinds = (Object.keys(CANCELLATION_KINDS) as CancellationKind[]).filter((k) => hasPermission(CANCELLATION_KINDS[k].permission));

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader title="Data Management" description="Cancel what is still pending on customer orders and branch indents, and list parts with their stock." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kinds.map((k) => (
          <Link key={k} href={`/data-management/${k}`} className={cardCls}>
            <Ban className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-semibold text-slate-800">{CANCELLATION_KINDS[k].title}</span>
              <span className="mt-1 block text-sm text-slate-500">{CANCELLATION_KINDS[k].description}</span>
            </span>
          </Link>
        ))}
        {hasPermission(INVENTORY_PERMISSIONS.STOCK_READ) && (
          <Link href="/parts-reports/current-stock" className={cardCls}>
            <FileBarChart className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Part List</span>
              <span className="mt-1 block text-sm text-slate-500">
                Parts in stock with their balance and value, by part category, purchase source or part (the Current Stock Balance
                report). Use List of Zero Balance Items for parts without stock.
              </span>
            </span>
          </Link>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        There is no Parts Posting here. Every receipt, issue, transfer and adjustment updates stock as it is saved, and the
        stock reports work out the balance on any date, so balances never need reposting or carrying forward to the next year.
      </p>
    </div>
  );
}
