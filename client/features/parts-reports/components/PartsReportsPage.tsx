"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileBarChart, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { getReportCatalogRequest, partsReportKeys, type ReportDefinition } from "../api/parts-reports.api";

const GROUP_ORDER = ["Counter sales", "Customer orders", "Purchase", "Transfers", "Stock movement", "Stock", "MIS"];

/** Legacy Parts module report menu: every report the user may run, by area. */
export function PartsReportsPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: partsReportKeys.catalog(), queryFn: getReportCatalogRequest });
  const groups = GROUP_ORDER.map((group) => ({ group, reports: (data ?? []).filter((r) => r.group === group) })).filter(
    (g) => g.reports.length,
  );

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Parts Reports"
        description="Counter sales, customer orders, purchase receipts, transfers, stock movement registers, stock ledgers, balances and ageing, and the MIS reports. Choose a report, set its filters and run it."
      />
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      ) : isError ? (
        <p className="py-12 text-center text-sm text-red-500">Reports could not be loaded.</p>
      ) : groups.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">You do not have access to any parts report.</p>
      ) : (
        groups.map(({ group, reports }) => (
          <section key={group} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{group}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {reports.map((r: ReportDefinition) => (
                <Link
                  key={r.kind}
                  href={`/parts-reports/${r.kind}`}
                  className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-primary/40 hover:shadow-sm"
                >
                  <FileBarChart className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">{r.title}</span>
                    <span className="mt-1 block text-sm text-slate-500">{r.description}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
