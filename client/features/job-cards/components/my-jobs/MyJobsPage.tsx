"use client";
import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { CalendarClock, Car, ClipboardList, Loader2, MapPin, Package, Play, RefreshCw, RotateCcw, Search, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { DataTablePagination } from "@/components/ui/table-components/DataTablePagination";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { formatDateTime, formatTime, formatWeekdayDate, NOT_PROVIDED } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMyJobs } from "../../hooks/use-job-repair";
import { useNow } from "../../hooks/use-now";
import { jobStageBadge } from "../../lib/job-stage.logic";
import { MY_JOB_TABS, nextActionVariant, vehicleText } from "../../lib/repair.logic";
import type { MyJob, MyJobTab } from "../../types/job-repair.types";

const LIMIT = 20;

/**
 * The technician's home on a phone: what to work on now. Tabs Today, Waiting parts and Done with
 * counts; large cards with plate, model, bay, step and promised time, and one full-width button.
 * Never prices. Only jobs assigned to this person in their branch.
 */
export function MyJobsPage() {
  const { isTechnician, hasPermission, isHydrated } = useAuth();
  const now = useNow();
  const [tab, setTab] = useState<MyJobTab>("TODAY");
  const [page, setPage] = useState(1);
  const allowed = hasPermission("jobcard:read");
  const query = useMyJobs(tab, page);

  const choose = (next: MyJobTab) => {
    setTab(next);
    setPage(1);
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = MY_JOB_TABS[(index + step + MY_JOB_TABS.length) % MY_JOB_TABS.length];
    choose(next.value);
    document.getElementById(`my-jobs-tab-${next.value}`)?.focus();
  };

  if (isHydrated && !allowed)
    return (
      <Shell now={now}>
        <p className="flex items-start gap-2 rounded-xl border border-border bg-card p-4 text-sm">
          <ShieldOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Your account cannot open job cards, so it has no jobs here. Ask your administrator if you need access.
        </p>
      </Shell>
    );

  const data = query.data;
  const active = MY_JOB_TABS.find((item) => item.value === tab)!;
  return (
    <Shell now={now}>
      {isHydrated && !isTechnician && (
        <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <Search className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            My jobs lists the jobs assigned to you as a technician. To find any other job, open{" "}
            <Link href="/job-cards" className="font-medium text-primary underline-offset-4 hover:underline">
              Job cards
            </Link>
            .
          </span>
        </p>
      )}
      <div role="tablist" aria-label="My jobs" className="grid grid-cols-3 gap-2">
        {MY_JOB_TABS.map((item, index) => {
          const selected = item.value === tab;
          const count = data?.counts[item.value];
          return (
            <button
              key={item.value}
              id={`my-jobs-tab-${item.value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="my-jobs-panel"
              tabIndex={selected ? 0 : -1}
              onKeyDown={(event) => onTabKey(event, index)}
              onClick={() => choose(item.value)}
              className={cn(
                "min-h-12 rounded-xl px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base",
                selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80",
              )}
            >
              {item.label}
              {count !== undefined && ` (${count})`}
            </button>
          );
        })}
      </div>

      <section id="my-jobs-panel" role="tabpanel" aria-labelledby={`my-jobs-tab-${tab}`} aria-busy={query.isFetching} className="space-y-3">
        {query.isLoading ? (
          <LoadingSkeleton label="Loading your jobs" />
        ) : query.isError || !data ? (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
            <p role="alert">Your jobs could not be loaded. Check your connection and try again.</p>
            <Button type="button" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
              {query.isFetching ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              Try again
            </Button>
          </div>
        ) : data.jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            <ClipboardList className="size-8" aria-hidden="true" />
            <p>{active.empty}</p>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {data.jobs.map((job) => (
                <JobCardItem key={job.id} job={job} now={now} />
              ))}
            </ul>
            <DataTablePagination page={page} pageSize={LIMIT} total={data.total} totalPages={Math.max(1, Math.ceil(data.total / LIMIT))} isFetching={query.isFetching} onPageChange={setPage} />
          </>
        )}
      </section>
    </Shell>
  );
}

function Shell({ now, children }: { now: Date; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 lg:px-5">
      <header>
        <h1 className="text-2xl font-semibold">My jobs</h1>
        <p className="text-sm text-muted-foreground">{formatWeekdayDate(now)}</p>
      </header>
      {children}
    </div>
  );
}

/** "Today, 16:00" for today, otherwise the full date and time. */
function promisedText(value: string | null, now: Date) {
  if (!value) return NOT_PROVIDED;
  const sameDay = formatWeekdayDate(value) === formatWeekdayDate(now);
  return sameDay ? `Today, ${formatTime(value)}` : formatDateTime(value);
}

function JobCardItem({ job, now }: { job: MyJob; now: Date }) {
  const badge = jobStageBadge(job.stage, job.status);
  const vehicle = vehicleText(job);
  const Icon = job.next.kind === "COLLECT" ? Package : job.next.kind === "VIEW" || job.next.kind === "WAITING" ? ClipboardList : Play;
  return (
    <li className={cn("space-y-3 rounded-2xl border bg-card p-4", job.returnedFromQc ? "border-red-200" : "border-border")}>
      {job.returnedFromQc && (
        <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
          Returned from quality check
        </p>
      )}
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Car className="size-6 text-muted-foreground" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-xl font-bold tracking-wide">{job.plate ?? `Job ${job.jobNumber}`}</p>
          <p className="text-sm text-muted-foreground">{vehicle ?? "Vehicle not recorded"}</p>
          <p className="text-xs text-muted-foreground">Job {job.jobNumber}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={badge.label} tone={badge.tone} className="text-xs normal-case" />
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden="true" />
            {job.bay ? `Bay ${job.bay.replace(/^bay\s*/i, "")}` : "No bay"}
          </span>
        </div>
      </div>
      <div className="text-sm">
        <p>
          Next: <span className="font-semibold">{job.next.label}</span>
        </p>
        <p className="text-muted-foreground">{job.returnedFromQc?.note ?? job.next.detail}</p>
        {job.sentForQcAt && <p className="text-muted-foreground">Sent for quality check at {formatTime(job.sentForQcAt)}.</p>}
      </div>
      <Button asChild size="lg" variant={nextActionVariant(job.next)} className="w-full">
        <Link href={`/job-cards/${job.id}`} aria-label={`${job.next.label}, ${job.plate ?? `job ${job.jobNumber}`}`}>
          <Icon aria-hidden="true" />
          {job.next.label}
        </Link>
      </Button>
      <p className="flex items-center gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
        <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
        Promised: {promisedText(job.promisedAt, now)}
      </p>
    </li>
  );
}
