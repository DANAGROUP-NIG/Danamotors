"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, CalendarDays, CheckCircle2, ClipboardList, Clock3, Repeat2, Search, XCircle } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/forms/DateInput";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { FilterPills, KpiCard } from "@/features/warranty/components/ui";
import { cn } from "@/lib/utils";
import { useRepeatJobs } from "../hooks/use-repeat-jobs";
import { formatDate, formatDays, formatKm, REPEAT_PERMISSIONS, REPEAT_STATUS, windowText, withinWindow } from "../lib/repeat-job.logic";
import type { RepeatListItem, RepeatSource, RepeatStatusFilter } from "../types/repeat-job.types";
import { ReasonChips, RepeatStatusBadge, SourceTag } from "./repeat-ui";

const input = "h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const FILTERS: RepeatStatusFilter[] = ["PENDING_REVIEW", "CONFIRMED", "NOT_REPEAT", "ALL"];

/** Workshop → Repeat jobs: the review queue (pending first) and every flagged repeat, newest first. */
export function RepeatJobsPage() {
  const { hasPermission } = useAuth();
  const canReview = hasPermission(REPEAT_PERMISSIONS.REVIEW);
  const [status, setStatus] = useState<RepeatStatusFilter>("PENDING_REVIEW");
  const [source, setSource] = useState<"" | RepeatSource>("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const params = { status, source: source || undefined, search: search.trim() || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, limit: 20 };
  const { data, isLoading, isFetching, isError, refetch } = useRepeatJobs(params);
  const counts = data?.statusCounts;
  const reset = () => setPage(1);

  const columns = useMemo<Column<RepeatListItem>[]>(
    () => [
      {
        header: "Repeat job",
        render: (row) => (
          <div>
            <Link href={`/repeat-jobs/${row.id}`} className="font-mono font-semibold text-primary hover:underline">
              {row.job.jobNumber}
            </Link>
            <p className="text-xs text-muted-foreground">
              {formatDate(row.job.date)} · {row.job.branch}
            </p>
          </div>
        ),
      },
      {
        header: "Vehicle",
        render: (row) => (
          <div className="min-w-0">
            <p className="font-medium text-foreground">{row.job.registration ?? "—"}</p>
            <p className="max-w-52 truncate text-xs text-muted-foreground">{row.job.variant ?? "—"}</p>
          </div>
        ),
      },
      {
        header: "Previous job",
        render: (row) => (
          <div>
            <Link href={`/job-cards/${row.previousJob.id}`} className="font-mono text-sm text-slate-700 hover:text-primary hover:underline">
              {row.previousJob.jobNumber}
            </Link>
            <p className="text-xs text-muted-foreground">{formatDate(row.previousJob.date)}</p>
          </div>
        ),
      },
      {
        header: "Back after",
        render: (row) => {
          const inside = withinWindow(row.window, row.daysDifference, row.kmDifference);
          return (
            <div className="flex flex-col gap-1 text-sm tabular-nums" title={`Window: ${windowText(row.window)}`}>
              <span className={cn("inline-flex items-center gap-1", inside.days ? "font-semibold text-amber-700" : "text-slate-600")}>
                <CalendarDays className="size-3.5" aria-hidden="true" /> {formatDays(row.daysDifference)}
              </span>
              <span className={cn("inline-flex items-center gap-1", inside.km ? "font-semibold text-amber-700" : "text-slate-600")}>
                <Repeat2 className="size-3.5" aria-hidden="true" /> {formatKm(row.kmDifference)}
              </span>
            </div>
          );
        },
      },
      {
        header: "Responsible (previous job)",
        render: (row) => (
          <div className="text-sm">
            <p className="text-slate-800">{row.previousEngineer ?? "No engineer"}</p>
            <p className="text-xs text-muted-foreground">SA: {row.previousServiceAdvisor ?? "—"}</p>
          </div>
        ),
      },
      { header: "Reasons", render: (row) => <ReasonChips reasons={row.reasons} dense empty={<span className="text-xs text-muted-foreground">—</span>} /> },
      {
        header: "Status",
        render: (row) => (
          <div className="flex flex-col items-start gap-1">
            <RepeatStatusBadge status={row.status} />
            <SourceTag source={row.source} />
          </div>
        ),
      },
      {
        header: <span className="sr-only">Action</span>,
        render: (row) => (
          <Button asChild size="sm" variant={row.status === "PENDING_REVIEW" && canReview ? "default" : "outline"}>
            <Link href={`/repeat-jobs/${row.id}`}>{row.status === "PENDING_REVIEW" && canReview ? "Review" : "Open"}</Link>
          </Button>
        ),
      },
    ],
    [canReview],
  );

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <PageHeader
        title="Repeat jobs"
        description="Vehicles back soon after a billed job. Review each one: record why it came back, or dismiss it as not a repeat."
        actions={
          <>
            {hasPermission(REPEAT_PERMISSIONS.LIST) && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/reports/repeat-list"><ClipboardList className="size-4" /> Repeat list</Link>
              </Button>
            )}
            {hasPermission(REPEAT_PERMISSIONS.ANALYSIS) && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/reports/repeat-analysis"><BarChart3 className="size-4" /> Analysis</Link>
              </Button>
            )}
            {hasPermission(REPEAT_PERMISSIONS.SUMMARY) && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/reports/repeat-summary"><CalendarDays className="size-4" /> Date-wise summary</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Pending review" icon={<Clock3 />} dot="amber" value={counts?.PENDING_REVIEW ?? "—"} sub="Flagged, no reason recorded yet" />
        <KpiCard label="Confirmed repeats" icon={<XCircle />} dot="red" value={counts?.CONFIRMED ?? "—"} sub="Count against the previous job" />
        <KpiCard label="Not a repeat" icon={<CheckCircle2 />} dot="emerald" value={counts?.NOT_REPEAT ?? "—"} sub="Dismissed at review" />
        <KpiCard label="All flagged" icon={<Repeat2 />} value={counts?.ALL ?? "—"} sub="With the filters below" />
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <FilterPills<RepeatStatusFilter>
          value={status}
          onChange={(value) => {
            setStatus(value);
            reset();
          }}
          options={FILTERS.map((value) => ({ value, label: value === "ALL" ? "All" : REPEAT_STATUS[value].label, count: counts?.[value] }))}
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <input
              aria-label="Search repeat jobs"
              className={`${input} pl-9`}
              placeholder="Job no, previous job, registration, VIN"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                reset();
              }}
            />
          </div>
          <select
            aria-label="Flagged"
            className={input}
            value={source}
            onChange={(event) => {
              setSource(event.target.value as "" | RepeatSource);
              reset();
            }}
          >
            <option value="">Flagged automatically or by hand</option>
            <option value="AUTOMATIC">Flagged automatically</option>
            <option value="MANUAL">Flagged by hand</option>
          </select>
          <DateInput value={dateFrom} onChange={(value) => { setDateFrom(value.slice(0, 10)); reset(); }} placeholder="Job date from" />
          <DateInput value={dateTo} onChange={(value) => { setDateTo(value.slice(0, 10)); reset(); }} placeholder="Job date to" />
        </div>
      </div>

      {isError ? (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Could not load repeat jobs.
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          emptyMessage={
            status === "PENDING_REVIEW" && !search && !source && !dateFrom && !dateTo
              ? "Nothing to review. New repeats appear here when a job is opened within the branch window."
              : "No repeat jobs match these filters."
          }
          page={page}
          pageSize={20}
          total={data?.meta.total}
          totalPages={data?.meta.totalPages}
          onPageChange={setPage}
        />
      )}
      <p className="sr-only" aria-live="polite">{isFetching ? "Updating list" : ""}</p>
    </div>
  );
}
