"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Search, Wallet, type LucideIcon } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { REPORT_PERMISSIONS } from "@/features/auth/roles";
import { cn } from "@/lib/utils";
import { REPORT_CONFIGS } from "../configs";
import type { ReportCategory } from "../types";

const CATEGORIES: ReportCategory[] = ["Front office", "Workshop", "Productivity", "Billing", "Vehicle analysis", "Finance"];

const TINTS = [
  "bg-blue-50 text-blue-600",
  "bg-amber-50 text-amber-600",
  "bg-emerald-50 text-emerald-600",
  "bg-purple-50 text-purple-600",
  "bg-orange-50 text-orange-600",
  "bg-sky-50 text-sky-600",
];

interface HubEntry {
  slug: string;
  href: string;
  title: string;
  description: string;
  category: ReportCategory;
  permissions: string[];
  orientation: "Portrait" | "Landscape";
  dateHint: string;
  icon: LucideIcon;
}

const ENTRIES: HubEntry[] = [
  ...REPORT_CONFIGS.map((config) => ({
    slug: config.slug,
    href: `/reports/${config.slug}`,
    title: config.title,
    description: config.description,
    category: config.category,
    permissions: [config.permission],
    orientation: config.width === 132 ? ("Landscape" as const) : ("Portrait" as const),
    dateHint: config.period.kind === "date" ? "Date based" : "Period based",
    icon: config.icon,
  })),
  {
    slug: "receipt-register",
    href: "/reports/receipt-register",
    title: "Receipt register",
    description: "Receipts, allocations and totals by payment mode",
    category: "Finance",
    permissions: [REPORT_PERMISSIONS.RECEIPT_REGISTER, "financereport:read"],
    orientation: "Landscape",
    dateHint: "Period based",
    icon: Wallet,
  },
];

export function ReportsHub() {
  const { hasAnyPermission } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ReportCategory | "All">("All");

  const permitted = useMemo(() => ENTRIES.filter((entry) => hasAnyPermission(entry.permissions)), [hasAnyPermission]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return permitted.filter(
      (entry) =>
        (category === "All" || entry.category === category) &&
        (!term || `${entry.title} ${entry.description} ${entry.category}`.toLowerCase().includes(term)),
    );
  }, [permitted, search, category]);
  const categories = CATEGORIES.filter((name) => permitted.some((entry) => entry.category === name));

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Reports</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Workshop, billing and finance reports for your branch.</p>
        </div>
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Search reports</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reports…"
            className="h-10 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      </div>

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Report categories">
          {(["All", ...categories] as const).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={category === name}
              onClick={() => setCategory(name)}
              className={cn(
                "h-9 rounded-full border px-4 text-sm font-medium transition-colors",
                category === name ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white hover:bg-muted",
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {permitted.length === 0 ? (
        <div className="rounded-xl border border-[#e8edf3] bg-white px-6 py-14 text-center text-sm text-muted-foreground">You do not have access to any reports.</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[#e8edf3] bg-white px-6 py-14 text-center text-sm text-muted-foreground">No reports match “{search}”.</div>
      ) : (
        CATEGORIES.map((name) => {
          const entries = visible.filter((entry) => entry.category === name);
          if (!entries.length) return null;
          return (
            <section key={name} aria-labelledby={`reports-${name}`} className="grid gap-3">
              <h2 id={`reports-${name}`} className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{name}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {entries.map((entry) => {
                  const Icon = entry.icon;
                  const tint = TINTS[ENTRIES.indexOf(entry) % TINTS.length];
                  return (
                    <Link
                      key={entry.slug}
                      href={entry.href}
                      className="group flex flex-col gap-4 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start gap-4">
                        <span className={cn("inline-grid size-12 shrink-0 place-items-center rounded-xl", tint)}>
                          <Icon className="size-6" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900">{entry.title}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">{entry.description}</p>
                        </div>
                        <ChevronRight className="size-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <FileText className="size-4" aria-hidden />
                        {entry.orientation}
                        <span aria-hidden>·</span>
                        {entry.dateHint}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
