"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, CalendarCheck2, CalendarX2, ChevronLeft, ChevronRight, FileBarChart, Inbox, PhoneCall, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/forms/DateInput";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { AllToggleMultiSelect } from "@/features/reports/components/AllToggleMultiSelect";
import { FilterPills } from "@/features/warranty/components/ui";
import { cn } from "@/lib/utils";
import { useCases, useCscSummary, useRuleModels } from "../hooks/use-csc";
import { CSC_PERMISSIONS, defaultRange, formatDay, relativeDay, STAGE_META, todayLocal } from "../lib/csc.logic";
import type { CscListItem, CscStage, CscState } from "../types/csc.types";
import { CaseDetailPanel } from "./CaseDetailPanel";
import { CaseStatusBadge, CscNav, EmptyPanel, inputCls, labelCls, MetricTile, ServiceChip, Toggle } from "./csc-ui";

const PAGE_SIZE = 20;
const STATES: { value: CscState; label: string }[] = [
  { value: "DUE", label: "Due" },
  { value: "DONE", label: "Done" },
  { value: "BOTH", label: "Both" },
];

function CaseRow({ item, stage, selected, onSelect, today }: { item: CscListItem; stage: CscStage; selected: boolean; onSelect: () => void; today: string }) {
  const stageDate = stage === "FIRST" ? item.followUp1Date : stage === "SECOND" ? item.followUp2Date : item.dueDate;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "group w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected ? "border-primary bg-primary/5 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ServiceChip service={item.service} />
            <span className="truncate font-mono text-sm font-semibold text-slate-900">{item.vehicle.registration ?? item.vehicle.vin}</span>
          </div>
          {item.status !== "OPEN" ? (
            <CaseStatusBadge status={item.status} />
          ) : item.stageDone ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <PhoneCall className="size-3" aria-hidden="true" /> {item.stageClosure ? `Closed ${item.stageClosure}` : `${item.stageContacts} call${item.stageContacts === 1 ? "" : "s"}`}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-sm text-slate-700">{item.customer?.name ?? "No customer"}</p>
        <p className="truncate text-xs text-slate-500">
          {item.vehicle.model ?? "—"}
          {item.customer?.phone ? ` · ${item.customer.phone}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-slate-500">
            {stage === "NOT_VISITED" ? "Due" : "Call"} {formatDay(stageDate)}
          </span>
          {stage === "NOT_VISITED" ? (
            <span className="font-semibold text-red-600">{item.daysOverdue} days overdue</span>
          ) : (
            <span className="text-slate-500">due {relativeDay(item.dueDate, today)}</span>
          )}
          {item.booked && (
            <span className="inline-flex items-center gap-1 font-medium text-blue-700">
              <CalendarCheck2 className="size-3" aria-hidden="true" /> Booked
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

/** 1st follow-up, 2nd follow-up and not-visited screens: filters and case list on the left, the case on the right. */
export function FollowUpWorkbench({ stage }: { stage: CscStage }) {
  const meta = STAGE_META[stage];
  const { hasPermission } = useAuth();
  const today = todayLocal();
  const initial = defaultRange(stage, today);
  const [state, setState] = useState<CscState>("DUE");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [models, setModels] = useState<string[] | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [includeFirstNotDone, setIncludeFirstNotDone] = useState(false);
  const [daysNotVisited, setDaysNotVisited] = useState("");
  const [onlyFollowedUp, setOnlyFollowedUp] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const rangeValid = !!from && !!to && from <= to;
  const params = {
    stage,
    state,
    from,
    to,
    page,
    limit: PAGE_SIZE,
    modelId: models,
    search: search.trim() || undefined,
    ...(stage === "SECOND" ? { includeFirstNotDone } : {}),
    ...(stage === "NOT_VISITED" ? { onlyFollowedUp, daysNotVisited: daysNotVisited ? Number(daysNotVisited) : undefined } : {}),
  };
  const list = useCases(params);
  const summary = useCscSummary();
  const ruleModels = useRuleModels();
  const items = useMemo(() => (rangeValid ? list.data?.items ?? [] : []), [rangeValid, list.data]);
  const reset = () => setPage(1);

  // Keep a case selected: the first one when the list changes and the current one is gone.
  useEffect(() => {
    if (!items.length) return;
    if (!selected || !items.some((item) => item.id === selected)) setSelected(items[0].id);
  }, [items, selected]);

  const index = items.findIndex((item) => item.id === selected);
  const next = index >= 0 && index < items.length - 1 ? items[index + 1].id : null;
  const totalPages = list.data?.meta.totalPages ?? 1;
  const modelOptions = (ruleModels.data ?? []).map((model) => ({ id: model.id, label: model.description, code: model.code, active: model.active }));
  const s = summary.data;

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader
        title={`CSC · ${meta.title}`}
        description={meta.description}
        actions={
          <>
            {hasPermission(CSC_PERMISSIONS.CASE_GENERATE) && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/csc/generate"><Sparkles className="size-4" /> Generate cases</Link>
              </Button>
            )}
            {stage === "NOT_VISITED" && hasPermission(CSC_PERMISSIONS.NOT_VISITED_REPORT) && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/reports/csc-not-visited"><FileBarChart className="size-4" /> Report</Link>
              </Button>
            )}
            {stage !== "NOT_VISITED" && hasPermission(CSC_PERMISSIONS.FOLLOWUP_REPORT) && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/reports/csc-followup"><FileBarChart className="size-4" /> Follow-up report</Link>
              </Button>
            )}
          </>
        }
      />
      <CscNav />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile label="1st calls due" value={s?.firstDue ?? "—"} sub="Up to today, not yet called" tone="blue" icon={<PhoneCall />} href={STAGE_META.FIRST.href} />
        <MetricTile label="2nd calls due" value={s?.secondDue ?? "—"} sub="Up to today, not yet called" tone="amber" icon={<BellRing />} href={STAGE_META.SECOND.href} />
        <MetricTile label="Not visited" value={s?.notVisited ?? "—"} sub="Past the due date" tone="red" icon={<CalendarX2 />} href={STAGE_META.NOT_VISITED.href} />
        <MetricTile label="Visited this month" value={s?.visitedThisMonth ?? "—"} sub={`${s?.booked ?? 0} open cases booked`} tone="emerald" icon={<CalendarCheck2 />} />
      </div>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterPills<CscState>
            value={state}
            onChange={(value) => {
              setState(value);
              reset();
            }}
            options={STATES.map((option) => ({ ...option, count: list.data?.stateCounts[option.value] }))}
          />
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
            <input
              aria-label="Search cases"
              className={`${inputCls} pl-9`}
              placeholder="Registration, VIN, customer, phone"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                reset();
              }}
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <span className={labelCls}>{meta.dateLabel} from</span>
            <DateInput value={from} onChange={(value) => { setFrom(value); reset(); }} invalid={!rangeValid} />
          </div>
          <div>
            <span className={labelCls}>To</span>
            <DateInput value={to} onChange={(value) => { setTo(value); reset(); }} invalid={!rangeValid} />
          </div>
          <AllToggleMultiSelect label="Model" allLabel="All models" value={models} onChange={(value) => { setModels(value); reset(); }} options={modelOptions} isLoading={ruleModels.isLoading} isError={ruleModels.isError} />
          {stage === "SECOND" && (
            <div className="flex items-end pb-1">
              <Toggle checked={includeFirstNotDone} onChange={(value) => { setIncludeFirstNotDone(value); reset(); }} label="Include 1st follow-up not done" description="Also cases nobody called the first time" />
            </div>
          )}
          {stage === "NOT_VISITED" && (
            <div className="grid grid-cols-[minmax(0,8rem)_1fr] items-end gap-3">
              <label className="block">
                <span className={labelCls}>Days overdue ≥</span>
                <input className={inputCls} inputMode="numeric" value={daysNotVisited} placeholder="Any" onChange={(event) => { setDaysNotVisited(event.target.value.replace(/\D/g, "").slice(0, 4)); reset(); }} />
              </label>
              <div className="pb-1">
                <Toggle checked={onlyFollowedUp} onChange={(value) => { setOnlyFollowedUp(value); reset(); }} label="Only followed up" />
              </div>
            </div>
          )}
        </div>
        {!rangeValid && <p className="text-sm font-medium text-red-600">Choose a from date on or before the to date.</p>}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <aside className="space-y-3" aria-label="Cases">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              {list.data ? `${list.data.meta.total} case${list.data.meta.total === 1 ? "" : "s"}` : "Loading…"}
              {list.isFetching && !list.isLoading ? " · updating" : ""}
            </span>
            {totalPages > 1 && (
              <span className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="size-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
                {page} / {totalPages}
                <Button variant="ghost" size="icon" className="size-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
              </span>
            )}
          </div>
          {list.isError ? (
            <div role="alert" className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              Could not load the cases.
              <Button variant="outline" size="sm" onClick={() => void list.refetch()}>Retry</Button>
            </div>
          ) : list.isLoading ? (
            <ul className="space-y-2">{Array.from({ length: 5 }, (_, key) => <li key={key} className="h-24 animate-pulse rounded-lg bg-slate-100" />)}</ul>
          ) : items.length ? (
            <ul className="max-h-[calc(100vh-12rem)] space-y-2 overflow-y-auto pr-1">
              {items.map((item) => (
                <CaseRow key={item.id} item={item} stage={stage} selected={item.id === selected} onSelect={() => setSelected(item.id)} today={today} />
              ))}
            </ul>
          ) : (
            <EmptyPanel icon={<Inbox />} title={state === "DUE" ? "Nothing due in this period" : "No cases match"}>
              Widen the dates, switch to Both, or generate the cases for the period first.
            </EmptyPanel>
          )}
        </aside>
        <div className="min-w-0">
          {selected && items.length ? (
            <CaseDetailPanel caseId={selected} stage={stage} hasNext={!!next} onSavedNext={() => next && setSelected(next)} />
          ) : (
            <EmptyPanel icon={<PhoneCall />} title="Choose a case">The customer, vehicle history and call form appear here.</EmptyPanel>
          )}
        </div>
      </div>
    </div>
  );
}
