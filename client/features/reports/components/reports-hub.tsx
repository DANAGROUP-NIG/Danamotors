"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FileText, Search, Wrench } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { PageHeader } from "@/components/headers/page-header";
import { MONTHLY_REPORTS } from "../monthly-config";
import { REPORT_CONFIGS } from "../configs";
import type { ReportCategory, ReportConfig } from "../types";
import { FinanceReportNav } from "./finance-report-nav";

const CATEGORY_NOTES: Partial<Record<ReportCategory, string>> = {
  "Service MIS": "Management reports for the workshop manager, the service manager and management.",
};

/** Framework reports (#75) the user may run and that match the search, grouped by category and subgroup in first-seen order. */
function frameworkSections(allowed: (permission: string) => boolean, search: string) {
  const needle = search.trim().toLowerCase();
  const sections = new Map<ReportCategory, Map<string, ReportConfig[]>>();
  for (const config of REPORT_CONFIGS.filter((r) => allowed(r.permission) && (!needle || `${r.title} ${r.description}`.toLowerCase().includes(needle)))) {
    const subgroups = sections.get(config.category) ?? new Map<string, ReportConfig[]>();
    const subgroup = config.subgroup ?? "";
    subgroups.set(subgroup, [...(subgroups.get(subgroup) ?? []), config]);
    sections.set(config.category, subgroups);
  }
  return Array.from(sections.entries()).map(([category, subgroups]) => ({ category, subgroups: Array.from(subgroups.entries()) }));
}

function ReportCard({ config }: { config: ReportConfig }) {
  const Icon = config.icon;
  return (
    <Link
      href={"/reports/" + config.slug}
      className="group flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-primary"
    >
      <div className="flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/5 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-primary" />
      </div>
      <h3 className="mb-2 mt-4 font-semibold">{config.title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{config.description}</p>
      <span className="mt-auto pt-3 text-xs text-muted-foreground">{config.width === 132 ? "132-column · landscape" : "80-column · portrait"}</span>
    </Link>
  );
}
export function ReportsHub() {
  const { hasPermission, isAdminOrAbove } = useAuth();
  const reports = MONTHLY_REPORTS.filter((r) =>
    hasPermission("report:" + r.slug),
  );
  const [search, setSearch] = useState("");
  const sections = frameworkSections(hasPermission, search);
  return (
    <div className="space-y-8 p-4 lg:p-8">
      <PageHeader
        title="Reports"
        description="Workshop activity, billing and vehicle records in one place."
      />
      <label className="relative block max-w-md">
        <span className="sr-only">Find a report</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a report, e.g. engineer, birthday, product mix"
          className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      {search && !sections.length && <p className="text-sm text-muted-foreground">No report matches “{search}”.</p>}
      {sections.map(({ category, subgroups }) => {
        const count = subgroups.reduce((total, [, configs]) => total + configs.length, 0);
        return (
          <section key={category} className="space-y-4">
            <div>
              <div className="flex items-center gap-3">
                <Wrench className="size-5 text-primary" />
                <h2 className="text-xl font-semibold">{category}</h2>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  {count} {count === 1 ? "report" : "reports"}
                </span>
              </div>
              {CATEGORY_NOTES[category] && <p className="mt-1 text-sm text-muted-foreground">{CATEGORY_NOTES[category]}</p>}
            </div>
            {subgroups.map(([subgroup, configs]) => (
              <div key={subgroup || "all"} className="space-y-3">
                {subgroup && <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{subgroup}</h3>}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {configs.map((config) => (
                    <ReportCard key={config.slug} config={config} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Wrench className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Monthly</h2>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {reports.length} reports
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((r) => (
            <Link
              key={r.slug}
              href={"/reports/" + r.slug}
              className="group rounded-2xl border bg-card p-5 shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-primary"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wider text-primary">
                  {r.code}
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-primary" />
              </div>
              <h3 className="mb-2 mt-5 font-semibold">{r.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {r.description}
              </p>
            </Link>
          ))}
        </div>
        {!reports.length && (
          <p className="text-sm text-muted-foreground">
            You have no monthly report permissions.
          </p>
        )}
        {isAdminOrAbove && hasPermission("corporate:manage") && (
          <Link
            href="/reports/corporate-groups"
            className="inline-block text-sm font-medium text-primary underline"
          >
            Manage corporate groups
          </Link>
        )}
      </section>
      {hasPermission("role:permission:update") && (
        <Link
          href="/reports/billing-settings"
          className="inline-block text-sm font-medium text-primary underline"
        >
          Parts VAT settings
        </Link>
      )}
      <section className="space-y-4">
        <h2 className="flex items-center gap-3 text-xl font-semibold">
          <FileText className="size-5 text-primary" />
          Finance
        </h2>
        <FinanceReportNav />
      </section>
    </div>
  );
}
