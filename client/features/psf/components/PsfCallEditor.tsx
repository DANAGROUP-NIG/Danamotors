"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  Check,
  History,
  Keyboard,
  Loader2,
  Lock,
  MessageSquareText,
  PhoneCall,
  RotateCcw,
  Save,
  Truck,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { formatDate, formatDateTime, lagosDay } from "@/features/late-deliveries/lib/late-delivery.logic";
import { AlertBanner, DetailField, SectionCard } from "@/features/warranty/components/ui";
import { cn } from "@/lib/utils";
import { usePsfServiceTypes, useRecordPsfCall } from "../hooks/use-psf";
import {
  addDays,
  applyToAll,
  callPayload,
  callProblem,
  daysSince,
  DEFAULT_REMARK,
  initialLineStatuses,
  isContacted,
  MAX_PSF_REMARK,
  PSF_PERMISSIONS,
  PSF_STATUS,
  PSF_STATUS_ORDER,
  QUICK_REMARKS,
  type CallDraft,
} from "../lib/psf.logic";
import type { PsfCall, PsfDetail, PsfStatus } from "../types/psf.types";
import { PsfCustomerCard } from "./PsfCustomerCard";
import { PsfStatusBadge, STATUS_ICON, TONE } from "./psf-ui";

interface EditorProps {
  detail: PsfDetail;
  onDirtyChange: (dirty: boolean) => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

function emptyDraft(detail: PsfDetail): CallDraft {
  const tomorrow = addDays(lagosDay(new Date()), 1);
  return { status: null, remark: "", lineStatuses: initialLineStatuses(detail.lines), booking: { enabled: false, date: tomorrow, time: "09:00", serviceTypeId: "", notes: "" } };
}

/** One delivered job: the customer to call, the outcome (legacy codes 1–5) per job and per line, remark, booking and history. */
export function PsfCallEditor({ detail, onDirtyChange, onPrevious, onNext }: EditorProps) {
  const { hasPermission, isSuperAdmin } = useAuth();
  const canCall = isSuperAdmin || hasPermission(PSF_PERMISSIONS.UPDATE);
  const record = useRecordPsfCall(detail.id);
  const [draft, setDraft] = useState<CallDraft>(() => emptyDraft(detail));
  const [touched, setTouched] = useState(false);
  const dirty = draft.status !== null || draft.remark.trim() !== "" || draft.booking.enabled;
  const problem = callProblem(draft, detail.lines);
  const contacted = isContacted(draft.status);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const chooseStatus = (status: PsfStatus) =>
    setDraft((current) => {
      const previousDefault = current.status ? (DEFAULT_REMARK[current.status] ?? "") : "";
      const remark = current.remark.trim() === "" || current.remark === previousDefault ? (DEFAULT_REMARK[status] ?? "") : current.remark;
      // A satisfied call cannot carry a dissatisfied line: picking 1 marks every line satisfied (legacy Submit).
      const lineStatuses = status === "SATISFIED" ? applyToAll(detail.lines, "SATISFIED") : current.lineStatuses;
      return { ...current, status, remark, lineStatuses, booking: isContacted(status) ? current.booking : { ...current.booking, enabled: false } };
    });

  const setLine = (key: string, status: PsfStatus) =>
    setDraft((current) => {
      const lineStatuses = { ...current.lineStatuses, [key]: status };
      // A dissatisfied line makes the call dissatisfied, so the dissatisfied list misses nobody.
      const callStatus = status === "DISSATISFIED" && current.status === "SATISFIED" ? "DISSATISFIED" : current.status;
      const remark = callStatus !== current.status && current.remark === DEFAULT_REMARK.SATISFIED ? "" : current.remark;
      return { ...current, status: callStatus, remark, lineStatuses };
    });

  // Legacy entry was by number: 1–5 picks the outcome (outside text fields).
  useEffect(() => {
    if (!canCall || detail.blockedReason) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const status = PSF_STATUS_ORDER.find((item) => String(PSF_STATUS[item].code) === event.key);
      if (!status) return;
      event.preventDefault();
      chooseStatus(status);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // chooseStatus only uses setDraft and detail.lines.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCall, detail.blockedReason, detail.lines]);

  const submit = (thenNext: boolean) => {
    setTouched(true);
    if (problem) return;
    record.mutate(callPayload(draft, detail.lines), { onSuccess: () => thenNext && onNext?.() });
  };
  const reset = () => {
    setDraft(emptyDraft(detail));
    setTouched(false);
  };

  const today = lagosDay(new Date());
  const deliveredDays = daysSince(lagosDay(new Date(detail.deliveredAt)), today);
  const vehicle = [detail.model, detail.variant].filter(Boolean).join(" · ") || "Model not set";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Follow-up status entry</p>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">
            <Link href={`/job-cards/${detail.id}`} className="font-mono underline-offset-4 hover:underline">{detail.jobNumber}</Link>
            <PsfStatusBadge status={detail.followUp?.status} />
            {detail.followUp && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{detail.followUp.callCount} call{detail.followUp.callCount === 1 ? "" : "s"}</span>}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-semibold tracking-wide text-slate-700">{detail.registration ?? "No registration"}</span> · {vehicle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrevious} disabled={!onPrevious} aria-label="Previous job in the list"><ArrowLeft className="size-4" /> Prev</Button>
          <Button variant="outline" size="sm" onClick={onNext} disabled={!onNext} aria-label="Next job in the list">Next <ArrowRight className="size-4" /></Button>
        </div>
      </header>

      <div className="grid gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3 xl:grid-cols-6">
        <DetailField label="Delivered" value={<span>{formatDate(detail.deliveredAt)} <span className="text-xs text-muted-foreground">({deliveredDays === 0 ? "today" : `${deliveredDays}d ago`})</span></span>} />
        <DetailField label="Follow-up date" value={detail.followUp ? formatDate(detail.followUp.lastCalledAt) : "—"} />
        <DetailField label="Service" value={detail.serviceType ? `${detail.serviceType.code} · ${detail.serviceType.description}` : "—"} />
        <DetailField label="Mileage" value={detail.mileage !== null ? `${detail.mileage.toLocaleString("en-NG")} km` : "—"} />
        <DetailField label="Service advisor" value={detail.serviceAdvisor ?? "—"} />
        <DetailField label="Delivered by" value={detail.deliveryAdvisor ?? "—"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
        <PsfCustomerCard detail={detail} />

        <div className="min-w-0 space-y-4">
          {detail.blockedReason ? (
            <AlertBanner tone="gray" icon={<Lock />} title="Follow-up closed">
              Closed{detail.followUp?.closedBy ? ` by ${detail.followUp.closedBy}` : ""}{detail.followUp?.closedAt ? ` on ${formatDateTime(detail.followUp.closedAt)}` : ""}.
              {detail.followUp?.remark && <span className="mt-1 block italic">“{detail.followUp.remark}”</span>}
              <span className="mt-1 block text-xs">A closed follow-up cannot be called again.</span>
            </AlertBanner>
          ) : !canCall ? (
            <AlertBanner tone="blue" icon={<PhoneCall />} title="View only">You can see this follow-up but not record calls (needs psf:update).</AlertBanner>
          ) : (
            <SectionCard
              icon={<PhoneCall />}
              title={detail.followUp ? "Record another call" : "Record the call"}
              note={detail.followUp ? `Attempt ${detail.followUp.callCount + 1}` : "First attempt"}
              action={<span className="hidden items-center gap-1 text-xs text-muted-foreground md:inline-flex"><Keyboard className="size-3.5" /> Press 1–5</span>}
            >
              <div role="radiogroup" aria-label="Outcome of the call" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {PSF_STATUS_ORDER.map((status) => {
                  const meta = PSF_STATUS[status];
                  const on = draft.status === status;
                  const Icon = STATUS_ICON[status];
                  return (
                    <button
                      key={status}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => chooseStatus(status)}
                      className={cn(
                        "flex flex-col gap-1.5 rounded-lg border bg-white p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                        on ? TONE[meta.tone].tileOn : cn("border-slate-200", TONE[meta.tone].tile),
                      )}
                    >
                      <span className="flex items-center justify-between">
                        <span className={cn("grid size-6 place-items-center rounded-md font-mono text-xs font-bold", on ? TONE[meta.tone].key : "bg-slate-100 text-slate-600")}>{meta.code}</span>
                        <Icon className={cn("size-4", on ? TONE[meta.tone].text : "text-slate-300")} aria-hidden />
                      </span>
                      <span className="text-sm font-semibold leading-tight text-slate-900">{meta.short}</span>
                      <span className="text-[11px] leading-snug text-slate-500">{meta.hint}</span>
                    </button>
                  );
                })}
              </div>

              <LinesTable detail={detail} draft={draft} contacted={contacted} onLine={setLine} onAll={(status) => setDraft((current) => ({ ...current, status: current.status === "SATISFIED" && status === "DISSATISFIED" ? "DISSATISFIED" : current.status, lineStatuses: applyToAll(detail.lines, status) }))} />

              <div className="mt-5">
                <label htmlFor="psf-remark" className="mb-1 flex items-center justify-between text-sm font-medium text-slate-700">
                  <span className="inline-flex items-center gap-1.5"><MessageSquareText className="size-4 text-slate-400" /> Remark{draft.status === "DISSATISFIED" || draft.status === "CLOSED" ? <span className="text-red-600">*</span> : null}</span>
                  <span className={cn("text-xs tabular-nums", draft.remark.length > MAX_PSF_REMARK ? "text-red-600" : "text-muted-foreground")}>{draft.remark.length} / {MAX_PSF_REMARK}</span>
                </label>
                {draft.status && (
                  <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Quick remarks">
                    {QUICK_REMARKS[draft.status].map((text) => (
                      <button key={text} type="button" onClick={() => setDraft((current) => ({ ...current, remark: text }))} className={cn("rounded-full border px-2.5 py-0.5 text-xs transition", draft.remark === text ? "border-primary bg-primary/5 text-primary" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white")}>
                        {text}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  id="psf-remark"
                  value={draft.remark}
                  onChange={(event) => setDraft((current) => ({ ...current, remark: event.target.value }))}
                  rows={2}
                  placeholder={draft.status === "DISSATISFIED" ? "What is the customer unhappy with?" : draft.status === "CLOSED" ? "Why is the follow-up closed?" : "What did the customer say?"}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <BookingFields detail={detail} draft={draft} contacted={contacted} onChange={(booking) => setDraft((current) => ({ ...current, booking: { ...current.booking, ...booking } }))} />

              {touched && problem && <p role="alert" className="mt-3 text-sm text-red-600">{problem}</p>}

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                {dirty && <span className="mr-auto text-sm text-amber-700">Unsaved call</span>}
                <Button variant="ghost" onClick={reset} disabled={!dirty || record.isPending}><RotateCcw className="size-4" /> Clear</Button>
                <Button variant="outline" onClick={() => submit(false)} disabled={!draft.status || record.isPending}>
                  {record.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save call
                </Button>
                {onNext && (
                  <Button onClick={() => submit(true)} disabled={!draft.status || record.isPending}>
                    Save &amp; next <ArrowRight className="size-4" />
                  </Button>
                )}
              </div>
            </SectionCard>
          )}

          <CallHistory detail={detail} />
        </div>
      </div>
    </div>
  );
}

function LinesTable({
  detail,
  draft,
  contacted,
  onLine,
  onAll,
}: {
  detail: PsfDetail;
  draft: CallDraft;
  contacted: boolean;
  onLine: (key: string, status: PsfStatus) => void;
  onAll: (status: PsfStatus) => void;
}) {
  if (detail.lines.length === 0)
    return <p className="mt-5 rounded-lg border border-dashed border-slate-200 px-3 py-3 text-sm text-muted-foreground">This job has no service type or labour marked for follow-up; only the call outcome is recorded.</p>;
  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700"><Wrench className="size-4 text-slate-400" /> Labour / service lines <span className="text-xs font-normal text-slate-400">{detail.lines.length}</span></p>
        {contacted && (
          <div className="flex gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => onAll("SATISFIED")}>All satisfied</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onAll("DISSATISFIED")}>All dissatisfied</Button>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Labour / service</th>
              <th className="px-3 py-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detail.lines.map((line) => {
              const value = contacted ? draft.lineStatuses[line.key] : draft.status;
              return (
                <tr key={line.key} className={cn(contacted && value === "DISSATISFIED" && "bg-red-50/60")}>
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700">{line.code}</td>
                  <td className="px-3 py-2">
                    <span className="text-slate-800">{line.description}</span>
                    <span className="ml-2 inline-flex gap-1 align-middle">
                      {line.kind === "SERVICE" && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium uppercase text-slate-500">Service</span>}
                      {line.major && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-medium uppercase text-amber-800">Major</span>}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {contacted ? (
                      <div role="radiogroup" aria-label={`Status of ${line.description}`} className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                        {(["SATISFIED", "DISSATISFIED"] as const).map((status) => (
                          <button
                            key={status}
                            type="button"
                            role="radio"
                            aria-checked={value === status}
                            onClick={() => onLine(line.key, status)}
                            className={cn(
                              "rounded-md px-2.5 py-1 text-xs font-medium transition",
                              value === status ? (status === "SATISFIED" ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : "text-slate-600 hover:bg-slate-50",
                            )}
                          >
                            {status === "SATISFIED" ? <><Check className="mr-0.5 inline size-3" />Satisfied</> : "Dissatisfied"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{value ? `Takes “${PSF_STATUS[value].short}”` : "Choose the outcome first"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!contacted && draft.status && <p className="mt-1.5 text-xs text-muted-foreground">The customer was not reached, so every line takes the call outcome.</p>}
    </div>
  );
}

function BookingFields({ detail, draft, contacted, onChange }: { detail: PsfDetail; draft: CallDraft; contacted: boolean; onChange: (booking: Partial<CallDraft["booking"]>) => void }) {
  const serviceTypes = usePsfServiceTypes();
  const today = lagosDay(new Date());
  return (
    <div className={cn("mt-5 rounded-lg border p-3", draft.booking.enabled ? "border-primary/30 bg-primary/5" : "border-slate-200")}>
      <label className={cn("flex items-center gap-2 text-sm font-medium", contacted ? "text-slate-700" : "text-slate-400")}>
        <input type="checkbox" className="size-4 accent-primary" checked={draft.booking.enabled} disabled={!contacted || !detail.customer} onChange={(event) => onChange({ enabled: event.target.checked })} />
        <CalendarPlus className="size-4" /> Book the next visit
        {!contacted && <span className="text-xs font-normal">(when the customer is reached)</span>}
      </label>
      {draft.booking.enabled && (
        <div className="mt-3 space-y-3">
          {detail.activeBooking && (
            <p className="rounded-md bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
              This vehicle already has booking <span className="font-mono font-semibold">{detail.activeBooking.bookingNumber ?? "—"}</span> on {formatDateTime(detail.activeBooking.scheduledAt)}. Saving links the call to it instead of creating a new one.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-slate-500">
              Date of booking
              <Input type="date" min={today} value={draft.booking.date} onChange={(event) => onChange({ date: event.target.value })} className="mt-1 h-9" />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Time
              <Input type="time" step={900} value={draft.booking.time} onChange={(event) => onChange({ time: event.target.value })} className="mt-1 h-9" />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Service
              <select value={draft.booking.serviceTypeId} onChange={(event) => onChange({ serviceTypeId: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                <option value="">Not specified</option>
                {(serviceTypes.data ?? []).map((type) => (
                  <option key={type.id} value={type.id}>{type.code} · {type.description}</option>
                ))}
              </select>
            </label>
          </div>
          <Input value={draft.booking.notes} maxLength={500} onChange={(event) => onChange({ notes: event.target.value })} placeholder="Booking notes (optional), e.g. recheck the AC" className="h-9" aria-label="Booking notes" />
        </div>
      )}
    </div>
  );
}

function CallHistory({ detail }: { detail: PsfDetail }) {
  return (
    <SectionCard icon={<History />} title="Call history" note={detail.calls.length ? `${detail.calls.length} attempt${detail.calls.length === 1 ? "" : "s"}` : undefined}>
      <ol className="space-y-4 text-sm">
        {detail.calls.map((call, index) => <CallEntry key={call.id} call={call} attempt={detail.calls.length - index} />)}
        <li className="flex gap-3">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-slate-300" aria-hidden />
          <div>
            <p className="flex items-center gap-1.5 text-slate-800"><Truck className="size-3.5 text-slate-400" /> Delivered{detail.deliveryAdvisor ? <> by <span className="font-medium">{detail.deliveryAdvisor}</span></> : null}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(detail.deliveredAt)} · {detail.branch.name}</p>
          </div>
        </li>
      </ol>
      {detail.calls.length === 0 && <p className="mt-3 text-xs text-muted-foreground">No call recorded yet.</p>}
    </SectionCard>
  );
}

function CallEntry({ call, attempt }: { call: PsfCall; attempt: number }) {
  const unhappy = useMemo(() => call.lines.filter((line) => line.status === "DISSATISFIED"), [call.lines]);
  return (
    <li className="flex gap-3">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE[PSF_STATUS[call.status].tone].dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <PsfStatusBadge status={call.status} />
          <span className="text-xs text-muted-foreground">Attempt {attempt} · {formatDateTime(call.calledAt)}{call.calledBy ? ` · ${call.calledBy}` : ""}</span>
        </p>
        {call.remark && <p className="mt-1 text-slate-700">“{call.remark}”</p>}
        {unhappy.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {unhappy.map((line) => (
              <li key={`${line.code}-${line.description}`} className="rounded-md bg-red-50 px-1.5 py-0.5 text-xs text-red-700 ring-1 ring-inset ring-red-200">
                <span className="font-mono font-semibold">{line.code}</span> {line.description}
              </li>
            ))}
          </ul>
        )}
        {call.bookingAt && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-primary/5 px-2 py-1 text-xs text-slate-700">
            <CalendarPlus className="size-3.5 text-primary" /> Booked for {formatDateTime(call.bookingAt)}
            {call.bookingServiceType ? ` · ${call.bookingServiceType.code}` : ""}
            {call.appointment?.bookingNumber ? <span className="font-mono"> · {call.appointment.bookingNumber}</span> : null}
          </p>
        )}
      </div>
    </li>
  );
}
