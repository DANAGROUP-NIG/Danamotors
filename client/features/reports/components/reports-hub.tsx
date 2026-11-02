"use client";
import Link from "next/link";
import { ArrowUpRight, FileText, Wrench } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { PageHeader } from "@/components/headers/page-header";
import { MONTHLY_REPORTS } from "../monthly-config";
import { REPORT_CONFIGS } from "../configs";
import type { ReportCategory, ReportConfig } from "../types";
import { FinanceReportNav } from "./finance-report-nav";

/** Framework reports (#75) the user may run, grouped by category in first-seen order. */
function frameworkSections(allowed: (permission: string) => boolean) {
  const sections = new Map<ReportCategory, ReportConfig[]>();
  for (const config of REPORT_CONFIGS.filter((r) => allowed(r.permission)))
    sections.set(config.category, [...(sections.get(config.category) ?? []), config]);
  return Array.from(sections.entries());
}
export function ReportsHub() {
  const { hasPermission, isAdminOrAbove } = useAuth();
  const reports = MONTHLY_REPORTS.filter((r) =>
    hasPermission("report:" + r.slug),
  );
  const sections = frameworkSections(hasPermission);
  return (
    <div className="space-y-8 p-4 lg:p-8">
      <PageHeader
        title="Reports"
        description="Workshop activity, billing and vehicle records in one place."
      />
      {sections.map(([category, configs]) => (
        <section key={category} className="space-y-4">
          <div className="flex items-center gap-3">
            <Wrench className="size-5 text-primary" />
            <h2 className="text-xl font-semibold">{category}</h2>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {configs.length} {configs.length === 1 ? "report" : "reports"}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {configs.map((r) => {
              const Icon = r.icon;
              return (
                <Link
                  key={r.slug}
                  href={"/reports/" + r.slug}
                  className="group rounded-2xl border bg-card p-5 shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-primary"
                >
                  <div className="flex items-center justify-between">
                    <Icon className="size-4 text-primary" aria-hidden />
                    <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <h3 className="mb-2 mt-5 font-semibold">{r.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {r.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
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
