"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileBarChart, Loader2, Search } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { getReportCatalogRequest, partsReportKeys, REPORT_GROUPS, type ReportDefinition } from "../api/parts-reports.api";

/** Every word typed must appear in the report's title, description or kind. */
const matches = (r: ReportDefinition, words: string[]) => {
  const text = `${r.title} ${r.description} ${r.kind} ${r.group}`.toLowerCase();
  return words.every((w) => text.includes(w));
};

/** Legacy Parts module report menus: every report the user may run, by menu. */
export function PartsReportsPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: partsReportKeys.catalog(), queryFn: getReportCatalogRequest });
  const [search, setSearch] = useState("");
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const reports = (data ?? []).filter((r) => matches(r, words));
  const groups = REPORT_GROUPS.map((group) => ({ group, reports: reports.filter((r) => r.group === group) })).filter((g) => g.reports.length);

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Parts Reports"
        description="The legacy Parts report menus: part sales, part purchase, transfers, stock, stock taking and audit, and MIS. Choose a report, set its filters and run it."
      />
      {!isLoading && !isError && !!data?.length && (
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            autoFocus
            className={cn(inputCls, "pl-9")}
            placeholder="Find a report, e.g. STN, SAN, ledger"
            aria-label="Find a report"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      ) : isError ? (
        <p className="py-12 text-center text-sm text-red-500">Reports could not be loaded.</p>
      ) : !data?.length ? (
        <p className="py-12 text-center text-sm text-muted-foreground">You do not have access to any parts report.</p>
      ) : groups.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No report matches &ldquo;{search}&rdquo;.</p>
      ) : (
        groups.map(({ group, reports }) => (
          <section key={group} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{group}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {reports.map((r) => (
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
