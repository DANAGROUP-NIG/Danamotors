"use client";
import { DiscardChangesDialog } from "@/components/modals/DiscardChangesDialog";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, FileBarChart, Frown, Inbox, Loader2, PhoneCall, Search, SmilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiErrorCode, apiErrorMessage } from "@/features/late-deliveries/lib/late-delivery.logic";
import { NOT_PROVIDED, formatDate, formatQuantity, lagosDayKey } from "@/lib/format";
import { AlertBanner, FilterPills } from "@/features/warranty/components/ui";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { useFindPsfJob, usePsfDetail, usePsfJobs } from "../hooks/use-psf";
import { addDays, PSF_PERMISSIONS, PSF_STATES, satisfactionPct } from "../lib/psf.logic";
import type { PsfListItem, PsfState } from "../types/psf.types";
import { PsfCallEditor } from "./PsfCallEditor";
import { PsfStatusBadge } from "./psf-ui";

const PAGE_SIZE = 20;

/**
 * Follow-up status entry (legacy Service → Follow-up): delivered jobs to call next to the selected job's
 * customer, call form and history. ?job=<id> opens a job.
 */
export function PsfWorkbench() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission, isSuperAdmin } = useAuth();
  const selectedId = searchParams.get("job");

  const [range, setRange] = useState(() => {
    const today = lagosDayKey(new Date());
    return { from: addDays(today, -30), to: today };
  });
  const [search, setSearch] = useState("");
  const [state, setState] = useState<PsfState>("toCall");
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search.trim(), 350);
  const list = usePsfJobs({ dateFrom: range.from || undefined, dateTo: range.to || undefined, search: debounced || undefined, state, page, limit: PAGE_SIZE });
  const detail = usePsfDetail(selectedId);

  const [findText, setFindText] = useState("");
  const [findError, setFindError] = useState<string | null>(null);
  const find = useFindPsfJob();
  const dirty = useRef(false);
  // The job to open once the user agrees to drop unsaved changes.
  const [leavingTo, setLeavingTo] = useState<{ id: string | null } | null>(null);
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);

  const leave = () => {
    if (!leavingTo) return;
    dirty.current = false;
    router.replace(leavingTo.id ? `${pathname}?job=${leavingTo.id}` : pathname, { scroll: false });
    setLeavingTo(null);
  };

  const open = useCallback(
    (id: string | null) => {
      if (id === selectedId) return;
      if (dirty.current) {
        setLeavingTo({ id });
        return;
      }
      router.replace(id ? `${pathname}?job=${id}` : pathname, { scroll: false });
    },
    [pathname, router, selectedId],
  );

  const runFind = (q: string) => {
    const value = q.trim();
    if (!value) return;
    setFindError(null);
    find.mutate(value, { onSuccess: (result) => open(result.id), onError: (error) => setFindError(apiErrorMessage(error, "Could not find this job.")) });
  };

  // Warn before closing the tab with an unsaved call.
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
  const detailError = detail.isError ? apiErrorMessage(detail.error, "Could not load this job.") : null;
  const notFollowable = detail.isError && apiErrorCode(detail.error).code === "NOT_FOLLOWABLE";
  const satisfaction = counts ? satisfactionPct(counts.satisfied, counts.dissatisfied) : null;
  const can = (permission: string) => isSuperAdmin || hasPermission(permission);

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <DiscardChangesDialog
        open={!!leavingTo}
        title="Leave without saving the call?"
        description="The call you started on this job is not saved yet."
        onStay={() => setLeavingTo(null)}
        onLeave={leave}
      />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Post-service follow-up</p>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-900">Follow-up status entry</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Call customers after delivery, record whether they are satisfied with the job and each labour line, and book the next visit. Dissatisfied customers go to the service manager.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(PSF_PERMISSIONS.READ) && <Button asChild variant="outline" size="sm"><Link href="/reports/psf-followup-list"><FileBarChart className="size-4" /> Follow-up list</Link></Button>}
          {can(PSF_PERMISSIONS.DISSATISFIED) && <Button asChild variant="outline" size="sm"><Link href="/reports/psf-dissatisfied"><Frown className="size-4" /> Dissatisfied</Link></Button>}
          {can(PSF_PERMISSIONS.ANALYSIS) && <Button asChild variant="outline" size="sm"><Link href="/reports/psf-analysis"><SmilePlus className="size-4" /> Analysis</Link></Button>}
        </div>
      </div>

      <section aria-label="Delivered in the period" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Delivered" value={counts?.all} sub={`${formatDate(`${range.from}T12:00:00Z`)} to ${formatDate(`${range.to}T12:00:00Z`)}`} />
        <Stat label="To call" value={counts?.toCall} sub="Not followed up or not reached" tone="text-amber-700" />
        <Stat label="Satisfied" value={counts?.satisfied} tone="text-emerald-700" />
        <Stat label="Dissatisfied (open)" value={counts?.dissatisfied} tone="text-red-700" />
        <Stat label="Satisfaction" value={satisfaction === null ? NOT_PROVIDED : `${formatQuantity(satisfaction)}%`} sub="Satisfied ÷ reached (open)" tone="text-primary" />
      </section>

      <form
        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          runFind(findText);
        }}
      >
        <label htmlFor="psf-find" className="text-sm font-medium text-slate-700">Job no.</label>
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input id="psf-find" value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="Job no. or registration, e.g. LSL-901PF" className="pl-9" autoComplete="off" />
        </div>
        <Button type="submit" disabled={!findText.trim() || find.isPending}>{find.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Open</Button>
        <p className="basis-full text-xs text-muted-foreground">A registration opens that vehicle&apos;s most recent delivered job.</p>
      </form>

      {findError && (
        <AlertBanner tone="amber" icon={<PhoneCall />} title="This job can't be followed up" action={<Button size="sm" variant="ghost" onClick={() => setFindError(null)}>Close</Button>}>
          {findError}
        </AlertBanner>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(20rem,25rem)_1fr]">
        <aside aria-label="Delivered jobs" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
          <div className="space-y-3 border-b border-slate-100 p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-slate-500">
                Delivered from
                <Input type="date" value={range.from} max={range.to || undefined} onChange={(event) => { setRange((current) => ({ ...current, from: event.target.value })); setPage(1); }} className="mt-1 h-9" />
              </label>
              <label className="text-xs font-medium text-slate-500">
                to
                <Input type="date" value={range.to} min={range.from || undefined} onChange={(event) => { setRange((current) => ({ ...current, to: event.target.value })); setPage(1); }} className="mt-1 h-9" />
              </label>
            </div>
            <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Filter by job no., registration or customer" className="h-9" aria-label="Filter the list" />
            <FilterPills<PsfState> value={state} onChange={(value) => { setState(value); setPage(1); }} options={PSF_STATES.map((item) => ({ ...item, count: counts?.[item.value] }))} />
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
                <p className="mt-2 text-sm font-medium text-slate-700">{state === "toCall" ? "Nobody left to call" : "No job here"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Try a wider delivery date range or another tab.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => <WorkItem key={item.id} item={item} active={item.id === selectedId} onOpen={() => open(item.id)} />)}
              </ul>
            )}
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-muted-foreground">
              <span>Page {meta.page} of {meta.totalPages}, {meta.total} jobs</span>
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
                <PhoneCall className="mx-auto size-10 text-slate-300" />
                <p className="mt-3 font-semibold text-slate-800">Pick a job to call</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Start with <strong>To call</strong>: jobs never followed up, or where the customer had no phone or was not available last time.</p>
              </div>
            </div>
          ) : detail.isLoading ? (
            <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-80 w-full" /></div>
          ) : detailError || !detail.data ? (
            <AlertBanner
              tone={notFollowable ? "amber" : "red"}
              icon={<PhoneCall />}
              title={notFollowable ? "This job can't be followed up" : "Could not open this job"}
              action={<Button size="sm" variant="outline" onClick={() => (notFollowable ? open(null) : void detail.refetch())}>{notFollowable ? "Close" : "Retry"}</Button>}
            >
              {detailError ?? "The job could not be loaded."}
            </AlertBanner>
          ) : (
            <PsfCallEditor
              // Remount after a saved call, so the form starts empty for the next attempt.
              key={`${detail.data.id}-${detail.data.calls[0]?.id ?? "none"}`}
              detail={detail.data}
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

function Stat({ label, value, sub, tone }: { label: string; value: number | string | undefined; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums text-slate-900", tone)}>{value === undefined ? "Loading" : typeof value === "number" ? value.toLocaleString("en-NG") : value}</p>
      {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function WorkItem({ item, active, onOpen }: { item: PsfListItem; active: boolean; onOpen: () => void }) {
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
            <span className="truncate text-xs font-medium tracking-wide text-slate-500">{item.registration ?? NOT_PROVIDED}</span>
          </p>
          <p className="truncate text-xs text-slate-700">{item.customer ?? "No customer"}</p>
          <p className="truncate text-xs text-muted-foreground">{[item.model, item.serviceType].filter(Boolean).join(", ") || NOT_PROVIDED}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs text-slate-500">{formatDate(item.deliveredAt)}</span>
          <PsfStatusBadge status={item.status} short />
          {item.callCount > 0 && <span className="text-[11px] text-muted-foreground">{item.callCount} call{item.callCount === 1 ? "" : "s"}</span>}
        </div>
      </button>
    </li>
  );
}
