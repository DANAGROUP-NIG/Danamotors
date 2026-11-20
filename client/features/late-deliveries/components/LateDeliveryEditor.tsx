"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarClock, Check, History, Keyboard, Loader2, MessageSquareText, RotateCcw, Save, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertBanner, DetailField, SectionCard } from "@/features/warranty/components/ui";
import { cn } from "@/lib/utils";
import { useSaveLateReasons } from "../hooks/use-late-deliveries";
import { formatDate, formatDateTime, formatTime, isDirty, LATE_KIND, lateByText, MAX_LATE_REASONS, MAX_LATE_REMARKS, saveProblem, toggleReason } from "../lib/late-delivery.logic";
import type { LateDetail, LateHistoryEntry, LateKind, LateReasonOption } from "../types/late-delivery.types";
import { LateKindBadge } from "./late-ui";

interface EditorProps {
  kind: LateKind;
  detail: LateDetail;
  reasons: LateReasonOption[];
  onDirtyChange: (dirty: boolean) => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

/** One late job: promise vs delivery, the six reason boxes and the delay remark. */
export function LateDeliveryEditor({ kind, detail, reasons, onDirtyChange, onPrevious, onNext }: EditorProps) {
  const save = useSaveLateReasons(detail.id);
  const [selected, setSelected] = useState<string[]>(detail.reasonIds);
  const [remarks, setRemarks] = useState(detail.remarks ?? "");
  const [touched, setTouched] = useState(false);
  const dirty = isDirty(selected, remarks, { reasonIds: detail.reasonIds, remarks: detail.remarks });
  const problem = saveProblem(selected, remarks);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // Retired reasons stay visible only where this job already uses them.
  const options = useMemo(() => reasons.filter((reason) => reason.active || selected.includes(reason.id) || detail.reasonIds.includes(reason.id)), [reasons, selected, detail.reasonIds]);
  const byId = useMemo(() => new Map(reasons.map((reason) => [reason.id, reason])), [reasons]);

  // Legacy entry was by reason number: typing 1-6 toggles a reason (outside text fields).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.closest("input, textarea, select, [contenteditable=true]")) return;
      const reason = options.find((option) => option.active && option.code === event.key);
      if (!reason) return;
      event.preventDefault();
      setTouched(true);
      setSelected((current) => toggleReason(current, reason.id));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options]);

  const submit = (thenNext: boolean) => {
    setTouched(true);
    if (problem) return;
    save.mutate({ kind, reasonIds: selected, remarks: remarks.trim() || null }, { onSuccess: () => thenNext && onNext?.() });
  };
  const reset = () => {
    setSelected(detail.reasonIds);
    setRemarks(detail.remarks ?? "");
    setTouched(false);
  };

  const late = detail.lateness;
  const vehicle = [detail.model, detail.variant].filter(Boolean).join(" · ") || "Model not set";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{LATE_KIND[kind].title}</p>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">
            <Link href={`/job-cards/${detail.id}`} className="font-mono underline-offset-4 hover:underline">{detail.jobNumber}</Link>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600" title="Transaction type">{detail.jobType === "PDI" ? "PDI job" : "Service job"}</span>
            {late.kind && <LateKindBadge kind={late.kind} />}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-semibold tracking-wide text-slate-700">{detail.registration ?? "No registration"}</span> · {vehicle}
            {detail.customer && <> · {detail.customer}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrevious} disabled={!onPrevious} aria-label="Previous job in the list"><ArrowLeft className="size-4" /> Prev</Button>
          <Button variant="outline" size="sm" onClick={onNext} disabled={!onNext} aria-label="Next job in the list">Next <ArrowRight className="size-4" /></Button>
        </div>
      </header>

      <section aria-label="Promise and delivery" className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
        <Moment label="Promised" date={formatDate(detail.promisedAt)} time={formatTime(detail.promisedAt)} icon={<CalendarClock className="size-4" />} />
        <Arrow />
        <Moment label="Delivered" date={formatDate(detail.deliveredAt)} time={formatTime(detail.deliveredAt)} icon={<Truck className="size-4" />} />
        <Arrow />
        <div className={cn("rounded-xl border p-4", late.kind === "DATE" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50")}>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Late by</p>
          <p className={cn("mt-1 text-2xl font-bold tabular-nums", late.kind === "DATE" ? "text-red-700" : "text-amber-800")}>{lateByText(late.kind, late.daysLate, late.minutesLate)}</p>
          <p className="text-xs text-slate-500">{late.kind === "DATE" ? `${lateByText("TIME", 0, late.minutesLate)} after the promise` : LATE_KIND.TIME.rule}</p>
        </div>
      </section>

      <div className="grid gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <DetailField label="Service type" value={detail.serviceType ?? "—"} />
        <DetailField label="Service advisor" value={detail.serviceAdvisor ?? "—"} />
        <DetailField label="Delivered by" value={detail.deliveryAdvisor ?? "—"} />
        <DetailField label="Gate pass" value={detail.gatePassNumber ?? "—"} mono />
      </div>

      <SectionCard
        icon={<CalendarClock />}
        title="Reasons for the delay"
        note={`${selected.length} / ${MAX_LATE_REASONS} selected`}
        action={<span className="hidden items-center gap-1 text-xs text-muted-foreground md:inline-flex"><Keyboard className="size-3.5" /> Press 1–{Math.min(options.length, 6)} to toggle</span>}
      >
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">No late-delivery reasons are configured. Ask an administrator to add them in Workshop masters (Late delivery reason).</p>
        ) : (
          <div role="group" aria-label="Late-delivery reasons" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {options.map((reason) => {
              const position = selected.indexOf(reason.id);
              const on = position >= 0;
              const full = !on && selected.length >= MAX_LATE_REASONS;
              return (
                <button
                  key={reason.id}
                  type="button"
                  aria-pressed={on}
                  disabled={full || (!reason.active && !on)}
                  onClick={() => {
                    setTouched(true);
                    setSelected((current) => toggleReason(current, reason.id));
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50",
                    on ? "border-primary bg-primary/5 text-slate-900 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-md font-mono text-sm font-semibold", on ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-600")}>
                    {on ? <Check className="size-4" /> : reason.code.length <= 2 ? reason.code : "•"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{reason.description}</span>
                    {!reason.active && <span className="text-xs text-amber-700">No longer in use</span>}
                  </span>
                  {on && <span className="rounded bg-primary/10 px-1.5 text-xs font-medium text-primary" title="Order entered">#{position + 1}</span>}
                </button>
              );
            })}
          </div>
        )}

        <label className="mt-4 block">
          <span className="mb-1 flex items-center justify-between text-sm font-medium text-slate-700">
            <span className="inline-flex items-center gap-1.5"><MessageSquareText className="size-4 text-slate-400" /> Remarks</span>
            <span className={cn("text-xs tabular-nums", remarks.length > MAX_LATE_REMARKS ? "text-red-600" : "text-muted-foreground")}>{remarks.length} / {MAX_LATE_REMARKS}</span>
          </span>
          <textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            rows={3}
            placeholder="What held the job up? Internal note; not printed for the customer."
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        {touched && problem && <p role="alert" className="mt-2 text-sm text-red-600">{problem}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {dirty && <span className="mr-auto text-sm text-amber-700">Unsaved changes</span>}
          <Button variant="ghost" onClick={reset} disabled={!dirty || save.isPending}><RotateCcw className="size-4" /> Undo</Button>
          <Button variant="outline" onClick={() => submit(false)} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
          </Button>
          {onNext && (
            <Button onClick={() => submit(true)} disabled={!dirty || save.isPending}>
              Save &amp; next <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </SectionCard>

      <HistoryCard detail={detail} byId={byId} />
    </div>
  );
}

function Moment({ label, date, time, icon }: { label: string; date: string; time: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500"><span className="text-slate-400">{icon}</span>{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{date}</p>
      <p className="font-mono text-sm text-slate-600">{time}</p>
    </div>
  );
}

function Arrow() {
  return (
    <div className="hidden items-center text-slate-300 sm:flex" aria-hidden>
      <ArrowRight className="size-5" />
    </div>
  );
}

function HistoryCard({ detail, byId }: { detail: LateDetail; byId: Map<string, LateReasonOption> }) {
  const codes = (ids: string[]) => (ids.length ? ids.map((id) => byId.get(id)?.code ?? "?").join(", ") : "none");
  const change = (entry: LateHistoryEntry) => {
    const parts: string[] = [];
    if (entry.before.reasonIds.join() !== entry.after.reasonIds.join()) parts.push(`reasons ${codes(entry.before.reasonIds)} → ${codes(entry.after.reasonIds)}`);
    if ((entry.before.remarks ?? "") !== (entry.after.remarks ?? "")) parts.push(entry.before.remarks ? (entry.after.remarks ? "remarks changed" : "remarks removed") : "remarks added");
    return parts.join(" · ") || "saved";
  };
  return (
    <SectionCard icon={<History />} title="History">
      <ol className="space-y-3 text-sm">
        {detail.history.map((entry) => (
          <li key={entry.id} className="flex gap-3">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
            <div>
              <p className="text-slate-800"><span className="font-medium">{entry.by ?? "Unknown user"}</span> {change(entry)}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(entry.at)} · on the {LATE_KIND[entry.kind].title.toLowerCase()} screen</p>
            </div>
          </li>
        ))}
        <li className="flex gap-3">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-slate-300" aria-hidden />
          <div>
            <p className="text-slate-800">Delivered{detail.deliveryAdvisor ? <> by <span className="font-medium">{detail.deliveryAdvisor}</span></> : null}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(detail.deliveredAt)}{detail.gatePassNumber ? ` · gate pass ${detail.gatePassNumber}` : ""}</p>
          </div>
        </li>
      </ol>
      {detail.history.length === 0 && <p className="mt-3 text-xs text-muted-foreground">No corrections yet. Reasons shown are those recorded at delivery.</p>}
    </SectionCard>
  );
}

/** Shown when a job cannot be opened on this screen (not late, or late of the other kind). */
export function NotLateBanner({ message, kind, jobId, query, onClear }: { message: string; kind: LateKind; jobId?: string; query?: string; onClear: () => void }) {
  const other = kind === "DATE" ? "TIME" : "DATE";
  const pointsElsewhere = /details entry/.test(message);
  const target = `${LATE_KIND[other].href}${jobId ? `?job=${jobId}` : query ? `?find=${encodeURIComponent(query)}` : ""}`;
  return (
    <AlertBanner
      tone="amber"
      icon={<CalendarClock />}
      title="This job can't be opened here"
      action={
        <div className="flex gap-2">
          {pointsElsewhere && <Button asChild size="sm" variant="outline"><Link href={target}>Go to {LATE_KIND[other].title.toLowerCase()}</Link></Button>}
          <Button size="sm" variant="ghost" onClick={onClear}>Close</Button>
        </div>
      }
    >
      {message}
    </AlertBanner>
  );
}
