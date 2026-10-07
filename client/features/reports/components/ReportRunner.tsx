"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, AlertTriangle, ChevronRight, FileSpreadsheet, FileText, Lock, Printer } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranchStore } from "@/store/branch.store";
import { useReportQuery } from "../hooks/use-reports";
import { exportReportExcel } from "../lib/report-excel";
import { fmtDateTime, plural } from "../lib/report-format";
import { defaultParams, parseParams, sameParams, toApiQuery, toSearch, validateParams, type ReportParams } from "../lib/report-params";
import type { ReportConfig, ReportResponse, ReportRow } from "../types";
import { ReportFilterBar } from "./ReportFilterBar";
import { appliedText, ReportPrintLayout } from "./ReportPrintLayout";
import { ReportSummaryStrip } from "./ReportSummaryStrip";
import { ReportTable } from "./ReportTable";

function errorMessage(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { message?: string; errors?: { message: string }[] } } })?.response;
  if (response?.data?.errors?.length) return response.data.errors.map((item) => item.message).join(" ");
  return response?.data?.message ?? "This report could not be loaded.";
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-[#e8edf3] bg-white px-6 py-14 text-center shadow-sm">{children}</div>;
}

function LoadingRows() {
  return (
    <div className="rounded-xl border border-[#e8edf3] bg-white p-4 shadow-sm" aria-busy="true" aria-label="Loading report">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex gap-4 border-b border-[#e8edf3] py-3 last:border-0">
          {[18, 26, 14, 22, 12].map((width, cell) => (
            <div key={cell} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${width}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ReportRunner<Row extends ReportRow>({ config }: { config: ReportConfig<Row> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAdminOrAbove, hasPermission, isHydrated } = useAuth();
  const activeBranch = useBranchStore((state) => state.activeBranch);
  const genericConfig = config as unknown as ReportConfig;

  const searchKey = searchParams.toString();
  const applied = useMemo(() => parseParams(genericConfig, new URLSearchParams(searchKey)), [genericConfig, searchKey]);
  const defaults = useMemo<ReportParams>(
    () => ({ ...defaultParams(genericConfig), branchId: isAdminOrAbove ? activeBranch?.id ?? "ALL" : undefined }),
    [genericConfig, isAdminOrAbove, activeBranch?.id],
  );
  const [draft, setDraft] = useState<ReportParams>(() => applied ?? defaults);
  const [error, setError] = useState<string | null>(null);

  // Follow back/forward navigation and bookmarked URLs.
  useEffect(() => {
    if (applied) setDraft(applied);
  }, [applied]);

  const apiQuery = useMemo(() => (applied ? toApiQuery(genericConfig, applied) : null), [genericConfig, applied]);
  const report = useReportQuery(config.slug, apiQuery);
  const data = report.data as ReportResponse<Row> | undefined;
  const options = applied?.options ?? draft.options;
  const dirty = Boolean(applied) && !sameParams(genericConfig, draft, applied);

  function run() {
    const problem = validateParams(genericConfig, draft);
    setError(problem);
    if (problem) return;
    if (sameParams(genericConfig, draft, applied)) {
      void report.refetch();
      return;
    }
    router.push(`${pathname}?${toSearch(genericConfig, draft)}`, { scroll: false });
  }

  if (isHydrated && !hasPermission(config.permission)) {
    return (
      <div className="p-4 lg:p-6">
        <Panel>
          <Lock className="mx-auto size-8 text-slate-400" />
          <p className="mt-3 font-semibold">You do not have access to this report.</p>
          <p className="mt-1 text-sm text-muted-foreground">Ask an administrator for the {config.title.toLowerCase()} permission.</p>
        </Panel>
      </div>
    );
  }

  const rowCount = data ? data.totals.count ?? data.meta.rowCount : 0;
  const isEmpty = data && rowCount === 0;
  const printedBy = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : "";

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6 print:gap-0 print:p-0">
      <div className="print:hidden">
        <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/reports" className="hover:text-foreground">Reports</Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span>{config.category}</span>
        </nav>
        <PageHeader
          title={config.title}
          description={config.description}
          actions={
            <>
              <Button variant="outline" disabled={!data || report.isFetching} onClick={() => window.print()}>
                <Printer className="size-4" />
                Print
              </Button>
              <Button variant="outline" disabled={!data || report.isFetching} onClick={() => data && void exportReportExcel(config, data, options)}>
                <FileSpreadsheet className="size-4" />
                Export Excel
              </Button>
            </>
          }
        />
      </div>

      <ReportFilterBar
        config={genericConfig}
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          setError(null);
        }}
        onRun={run}
        onReset={() => {
          setDraft(defaults);
          setError(null);
        }}
        isRunning={report.isFetching}
        dirty={dirty}
        error={error}
        canChooseBranch={isAdminOrAbove}
      />

      {!applied ? (
        <Panel>
          <FileText className="mx-auto size-8 text-slate-400" />
          <p className="mt-3 font-semibold">Set the filters and select Run report</p>
          <p className="mt-1 text-sm text-muted-foreground">The report runs for your branch. Bookmark the page after running to keep these filters.</p>
        </Panel>
      ) : report.isLoading ? (
        <LoadingRows />
      ) : report.isError && !data ? (
        <Panel>
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <p role="alert" className="mt-3 font-semibold text-destructive">{errorMessage(report.error)}</p>
          <Button variant="outline" className="mt-4" onClick={() => void report.refetch()}>Retry</Button>
        </Panel>
      ) : data ? (
        <>
          {config.summaryCards && <ReportSummaryStrip cards={config.summaryCards(data, options)} />}
          {config.extra && <div className="print:hidden">{config.extra(data)}</div>}

          <section className="relative overflow-hidden rounded-xl border border-[#e8edf3] bg-white shadow-sm print:hidden" aria-label="Report results" aria-busy={report.isFetching}>
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#e8edf3] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {plural(rowCount, config.noun)} · Generated {fmtDateTime(data.report.generatedAt)} · {data.meta.branch === "ALL" ? "All branches" : data.meta.branch.name}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">Applied: {appliedText(data) || "No filters"}</p>
              </div>
              {report.isFetching && <span className="text-sm text-muted-foreground">Updating…</span>}
            </div>

            {data.meta.truncated && (
              <div role="status" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-800">
                <AlertTriangle className="size-4 shrink-0" />
                Only the first {plural(data.meta.rowCount, config.noun)} are shown. Narrow the dates or filters to see everything; totals cover the rows shown.
              </div>
            )}
            {report.isError && (
              <div role="alert" className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">
                <AlertCircle className="size-4 shrink-0" />
                {errorMessage(report.error)} Showing the previous result.
              </div>
            )}

            {isEmpty ? (
              <div className="px-6 py-14 text-center">
                <FileText className="mx-auto size-8 text-slate-300" />
                <p className="mt-3 font-semibold">{config.emptyMessage ?? `No ${config.noun[1]} match these filters`}</p>
                <p className="mt-1 text-sm text-muted-foreground">Try a wider date range or tick All on a filter.</p>
              </div>
            ) : (
              <ReportTable config={config} data={data} options={options} />
            )}
            {config.footnote && !isEmpty && <p className="border-t border-[#e8edf3] px-5 py-2.5 text-sm text-muted-foreground">{config.footnote}</p>}
          </section>

          <ReportPrintLayout config={config} data={data} options={options} printedBy={printedBy} />
        </>
      ) : null}
    </div>
  );
}
