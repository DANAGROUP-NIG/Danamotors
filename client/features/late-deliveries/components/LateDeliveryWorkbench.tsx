"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, Clock3, FileBarChart, Inbox, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { AlertBanner, FilterPills } from "@/features/warranty/components/ui";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { useFindLateJob, useLateDetail, useLateJobs, useLateReasons } from "../hooks/use-late-deliveries";
import { apiErrorCode, apiErrorMessage, formatDate, formatTime, LATE_KIND, LATE_PERMISSIONS, lagosDay, lateByText, monthRange } from "../lib/late-delivery.logic";
import type { LateKind, LateListItem, ReasonFilter } from "../types/late-delivery.types";
import { LateDeliveryEditor, NotLateBanner } from "./LateDeliveryEditor";

const PAGE_SIZE = 20;

/**
 * Promise date / time details entry (legacy Service menu): a worklist of jobs delivered late of one
 * kind next to the selected job's reasons and remark. ?job=<id> opens a job; ?find=<job no or reg> finds one.
 */
export function LateDeliveryWorkbench({ kind }: { kind: LateKind }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const selectedId = searchParams.get("job");
  const findParam = searchParams.get("find");

  const [range, setRange] = useState(() => monthRange(lagosDay(new Date())));
  const [search, setSearch] = useState("");
  const [reasons, setReasons] = useState<ReasonFilter>("all");
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search.trim(), 350);
  const list = useLateJobs({ kind, dateFrom: range.from || undefined, dateTo: range.to || undefined, search: debounced || undefined, reasons, page, limit: PAGE_SIZE });
  const reasonOptions = useLateReasons();
  const detail = useLateDetail(selectedId, kind);

  const [findText, setFindText] = useState(findParam ?? "");
  const [findError, setFindError] = useState<{ message: string; query: string } | null>(null);
  const find = useFindLateJob(kind);
  const dirty = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);

  const open = useCallback(
    (id: string | null) => {
      if (id === selectedId) return;
      if (dirty.current && !window.confirm("You have unsaved changes on this job. Leave without saving?")) return;
      dirty.current = false;
      router.replace(id ? `${pathname}?job=${id}` : pathname, { scroll: false });
    },
    [pathname, router, selectedId],
  );

  const runFind = useCallback(
    (q: string) => {
      const value = q.trim();
      if (!value) return;
      setFindError(null);
      find.mutate(value, { onSuccess: (result) => open(result.id), onError: (error) => setFindError({ message: apiErrorMessage(error, "Could not find this job."), query: value }) });
    },
    [find, open],
  );

  // ?find= from a link (e.g. "go to the other screen") runs the search once.
  const ranFind = useRef(false);
  useEffect(() => {
    if (findParam && !ranFind.current) {
      ranFind.current = true;
      runFind(findParam);
    }
  }, [findParam, runFind]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const items = list.data?.items ?? [];
  const index = items.findIndex((item) => item.id === selectedId);
  const previous = index > 0 ? items[index - 1] : undefined;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : undefined;
  const meta = list.data?.meta;
  const counts = list.data?.counts;
  const other: LateKind = kind === "DATE" ? "TIME" : "DATE";
  const detailError = detail.isError ? apiErrorMessage(detail.error, "Could not load this job.") : null;
  const notLate = detail.isError && apiErrorCode(detail.error).code === "NOT_LATE";
  const reportHref = kind === "DATE" ? "/reports/promise-date-discrepancy" : "/reports/promise-time-discrepancy";
  const canReport = hasPermission(kind === "DATE" ? LATE_PERMISSIONS.DATE_DISCREPANCY : LATE_PERMISSIONS.TIME_DISCREPANCY);

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Late deliveries</p>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-900">{LATE_KIND[kind].title} entry</h1>
          <p className="mt-1 text-sm text-muted-foreground">{LATE_KIND[kind].rule} Record why, so the delayed delivery analysis shows the real causes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Late delivery kind" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            {(["DATE", "TIME"] as const).map((item) => (
              <Link
                key={item}
                href={LATE_KIND[item].href}
                aria-current={item === kind ? "page" : undefined}
                className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", item === kind ? "bg-primary text-primary-foreground shadow-sm" : "text-slate-600 hover:bg-slate-50")}
              >
                {item === "DATE" ? <CalendarClock className="size-4" /> : <Clock3 className="size-4" />}
                {LATE_KIND[item].label}
              </Link>
            ))}
          </nav>
          {canReport && (
            <Button asChild variant="outline" size="sm">
              <Link href={reportHref}><FileBarChart className="size-4" /> Discrepancy report</Link>
            </Button>
          )}
        </div>
      </div>

      <form
        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          runFind(findText);
        }}
      >
        <label htmlFor="late-find" className="text-sm font-medium text-slate-700">Find a job</label>
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input id="late-find" value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="Job no. or registration, e.g. LSL-801LD" className="pl-9" autoComplete="off" />
        </div>
        <Button type="submit" disabled={!findText.trim() || find.isPending}>{find.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Find</Button>
        <p className="basis-full text-xs text-muted-foreground">A registration opens that vehicle&apos;s most recent job delivered {LATE_KIND[kind].label.toLowerCase()}.</p>
      </form>

      {findError && <NotLateBanner message={findError.message} kind={kind} query={findError.query} onClear={() => setFindError(null)} />}

      <div className="grid gap-5 lg:grid-cols-[minmax(20rem,26rem)_1fr]">
        <aside aria-label="Jobs delivered late" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
          <div className="space-y-3 border-b border-slate-100 p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-slate-500">
                Promised from
                <Input type="date" value={range.from} max={range.to || undefined} onChange={(event) => { setRange((current) => ({ ...current, from: event.target.value })); setPage(1); }} className="mt-1 h-9" />
              </label>
              <label className="text-xs font-medium text-slate-500">
                to
                <Input type="date" value={range.to} min={range.from || undefined} onChange={(event) => { setRange((current) => ({ ...current, to: event.target.value })); setPage(1); }} className="mt-1 h-9" />
              </label>
            </div>
            <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Filter by job no. or registration" className="h-9" aria-label="Filter the list" />
            <FilterPills<ReasonFilter>
              value={reasons}
              onChange={(value) => { setReasons(value); setPage(1); }}
              options={[
                { value: "all", label: "All", count: counts?.all },
                { value: "missing", label: "No reason", count: counts?.missing },
                { value: "recorded", label: "Recorded", count: counts?.recorded },
              ]}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={list.isFetching}>
            {list.isLoading ? (
              <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : list.isError ? (
              <div className="p-4 text-sm text-red-600" role="alert">
                {apiErrorMessage(list.error, "Could not load the list.")} <button type="button" className="underline" onClick={() => void list.refetch()}>Retry</button>
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Inbox className="mx-auto size-8 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-700">No job delivered {LATE_KIND[kind].label.toLowerCase()}</p>
                <p className="mt-1 text-xs text-muted-foreground">Try a wider promised date range, or the {LATE_KIND[other].label.toLowerCase()} screen.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => <WorkItem key={item.id} item={item} kind={kind} active={item.id === selectedId} onOpen={() => open(item.id)} />)}
              </ul>
            )}
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-muted-foreground">
              <span>Page {meta.page} of {meta.totalPages} · {meta.total} jobs</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
                <Button variant="ghost" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
              </div>
            </div>
          )}
        </aside>

        <main className="min-w-0">
          {!selectedId ? (
            <div className="grid h-full min-h-72 place-items-center rounded-xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
              <div>
                {kind === "DATE" ? <CalendarClock className="mx-auto size-10 text-slate-300" /> : <Clock3 className="mx-auto size-10 text-slate-300" />}
                <p className="mt-3 font-semibold text-slate-800">Pick a job from the list</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Or find one by job number or registration. Start with <strong>No reason</strong> to clear jobs delivered late without an explanation.</p>
              </div>
            </div>
          ) : detail.isLoading || reasonOptions.isLoading ? (
            <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>
          ) : notLate && detailError ? (
            <NotLateBanner message={detailError} kind={kind} jobId={selectedId} onClear={() => open(null)} />
          ) : detailError || !detail.data ? (
            <AlertBanner tone="red" icon={<CalendarClock />} title="Could not open this job" action={<Button size="sm" variant="outline" onClick={() => void detail.refetch()}>Retry</Button>}>
              {detailError ?? "The job could not be loaded."}
            </AlertBanner>
          ) : (
            <LateDeliveryEditor
              // Remount when another job (or a saved version) loads, so the form starts from the server.
              key={`${detail.data.id}-${detail.data.history[0]?.id ?? "none"}`}
              kind={kind}
              detail={detail.data}
              reasons={reasonOptions.data ?? []}
              onDirtyChange={setDirty}
              onPrevious={previous ? () => open(previous.id) : undefined}
              onNext={next ? () => open(next.id) : undefined}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function WorkItem({ item, kind, active, onOpen }: { item: LateListItem; kind: LateKind; active: boolean; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={cn("flex w-full gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none", active && "bg-primary/5 shadow-[inset_3px_0_0] shadow-primary")}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-900">{item.jobNumber}</span>
            <span className="truncate text-xs font-medium tracking-wide text-slate-500">{item.registration ?? "—"}</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">{[item.model, item.serviceAdvisor].filter(Boolean).join(" · ") || "—"}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDate(item.promisedAt)} {formatTime(item.promisedAt)} → {kind === "DATE" ? `${formatDate(item.deliveredAt)} ` : ""}{formatTime(item.deliveredAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={cn("text-sm font-semibold tabular-nums", kind === "DATE" ? "text-red-700" : "text-amber-700")}>{lateByText(kind, item.daysLate, item.minutesLate)}</span>
          {item.reasonCount ? (
            <span className="rounded-full bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-700">{item.reasonCount} reason{item.reasonCount === 1 ? "" : "s"}</span>
          ) : (
            <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-medium text-amber-800">No reason</span>
          )}
        </div>
      </button>
    </li>
  );
}
