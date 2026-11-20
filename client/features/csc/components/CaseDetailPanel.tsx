"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck2,
  CalendarClock,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  Loader2,
  Mail,
  MapPin,
  Phone,
  PhoneCall,
  Save,
  ShieldX,
  User,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/forms/DateInput";
import { DateTimeInput } from "@/components/forms/DateTimeInput";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { AlertBanner, Pill } from "@/features/warranty/components/ui";
import { cn } from "@/lib/utils";
import { useCase, useCscStaff, useReasons, useSaveFollowUp } from "../hooks/use-csc";
import {
  CLOSURE_TYPE,
  contactDrafts,
  followUpPayload,
  followUpProblem,
  formatDateTime,
  formatDay,
  formatKm,
  relativeDay,
  STAGE_META,
  todayLocal,
  VISIT_TIMING,
} from "../lib/csc.logic";
import type { CscCaseDetail, CscStage, ContactDraft } from "../types/csc.types";
import { CaseStatusBadge, inputCls, labelCls, ServiceChip, Toggle } from "./csc-ui";

const STAGES: CscStage[] = ["FIRST", "SECOND", "NOT_VISITED"];

function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-sm text-slate-700">
      <span className="mt-0.5 shrink-0 text-slate-400 [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

function Card({ title, icon, children, className }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-4", className)}>
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <span className="[&_svg]:size-4">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Calls recorded at the other stages, newest stage first, as a compact timeline. */
function History_({ detail, stage }: { detail: CscCaseDetail; stage: CscStage }) {
  const entries = STAGES.filter((other) => other !== stage).flatMap((other) => {
    const data = detail.stages[other];
    return [
      ...data.contacts.map((contact) => ({ key: contact.id, stage: other, date: contact.contactDate, text: [contact.contactPerson, contact.remarks].filter(Boolean).join(" — "), by: contact.doneBy?.name ?? null, closure: null as string | null })),
      ...(data.closure ? [{ key: `${other}-closure`, stage: other, date: data.closure.closedAt.slice(0, 10), text: data.closure.remarks ?? "", by: data.closure.closedBy, closure: `${data.closure.reason.code} ${data.closure.reason.description}` }] : []),
    ];
  });
  if (!entries.length) return null;
  return (
    <Card title="Earlier follow-ups" icon={<History />}>
      <ol className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.key} className="relative border-l-2 border-slate-200 pl-3">
            <p className="text-xs text-slate-500">
              {STAGE_META[entry.stage].short} · {formatDay(entry.date)}
              {entry.by ? ` · ${entry.by}` : ""}
            </p>
            {entry.closure && <p className="text-sm font-medium text-slate-800">Closed: {entry.closure}</p>}
            {entry.text && <p className="text-sm text-slate-700">{entry.text}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

interface Props {
  caseId: string;
  stage: CscStage;
  /** Moves to the next case in the list after saving. */
  onSavedNext?: () => void;
  hasNext: boolean;
}

/** The selected case: who to call, the vehicle's history, and the follow-up form for this stage. */
export function CaseDetailPanel({ caseId, stage, onSavedNext, hasNext }: Props) {
  const { data: detail, isLoading, isError, refetch } = useCase(caseId);
  if (isLoading) {
    return (
      <div className="flex min-h-80 items-center justify-center rounded-xl border border-slate-200 bg-white">
        <Loader2 className="size-6 animate-spin text-slate-400" aria-label="Loading case" />
      </div>
    );
  }
  if (isError || !detail) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        Could not load this case.
        <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>
      </div>
    );
  }
  return <CaseDetail key={`${detail.id}-${stage}`} detail={detail} stage={stage} onSavedNext={onSavedNext} hasNext={hasNext} />;
}

function CaseDetail({ detail, stage, onSavedNext, hasNext }: { detail: CscCaseDetail; stage: CscStage; onSavedNext?: () => void; hasNext: boolean }) {
  const { user } = useAuth();
  const today = todayLocal();
  const staff = useCscStaff();
  const reasons = useReasons();
  const save = useSaveFollowUp(detail.id);
  const stageData = detail.stages[stage];
  const [contacts, setContacts] = useState<ContactDraft[]>(() => contactDrafts(detail, stage, today, user?.id ?? ""));
  const [book, setBook] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [close, setClose] = useState(false);
  const [reasonId, setReasonId] = useState(stageData.closure?.reason.id ?? "");
  const [closeRemarks, setCloseRemarks] = useState(stageData.closure?.remarks ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setProblem(null), [contacts, book, scheduledAt, close, reasonId]);

  const reason = useMemo(() => reasons.data?.find((row) => row.id === reasonId), [reasons.data, reasonId]);
  const editable = detail.canEdit;
  const customer = detail.customer;
  const phones = [customer?.phoneNumber, customer?.mobile2].filter((value): value is string => !!value);

  const update = (slot: number, patch: Partial<ContactDraft>) => setContacts((rows) => rows.map((row) => (row.slot === slot ? { ...row, ...patch } : row)));

  const submit = (next: boolean) => {
    const input = { contacts, book, scheduledAt, close, reasonId, reasonType: reason?.closureType };
    const found = followUpProblem(input, today);
    if (found) {
      setProblem(found);
      return;
    }
    const payload = followUpPayload(stage, { contacts, book, scheduledAt: book ? new Date(scheduledAt).toISOString() : "", bookingNotes, close, reasonId, closeRemarks });
    save.mutate(payload, { onSuccess: () => (next ? onSavedNext?.() : undefined) });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ServiceChip service={detail.service} />
              <h2 className="font-mono text-lg font-bold tracking-wide text-slate-900">{detail.vehicle.registration ?? detail.vehicle.vin}</h2>
              <CaseStatusBadge status={detail.status} />
            </div>
            <p className="mt-1 truncate text-sm text-slate-500">
              {[detail.vehicle.model, detail.vehicle.variant].filter(Boolean).join(" · ") || "Model not recorded"} · VIN <span className="font-mono">{detail.vehicle.vin}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{detail.service.description} due</p>
            <p className="text-lg font-semibold text-slate-900">{formatDay(detail.dueDate)}</p>
            <p className={cn("text-xs", detail.notVisited ? "font-semibold text-red-600" : "text-slate-500")}>
              {relativeDay(detail.dueDate, today)} · {formatKm(detail.dueMileage)}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-slate-500">1st call</dt><dd className="font-medium text-slate-800">{formatDay(detail.followUp1Date)}</dd></div>
          <div><dt className="text-xs text-slate-500">2nd call</dt><dd className="font-medium text-slate-800">{formatDay(detail.followUp2Date)}</dd></div>
          <div><dt className="text-xs text-slate-500">Visit window</dt><dd className="font-medium text-slate-800">−{detail.matchDaysBefore} / +{detail.matchDaysAfter} days</dd></div>
          <div><dt className="text-xs text-slate-500">Branch</dt><dd className="truncate font-medium text-slate-800">{detail.branch.name}</dd></div>
        </dl>
      </section>

      {/* Outcome banners */}
      {detail.visit && (
        <AlertBanner tone="emerald" icon={<CheckCircle2 />} title={`Visited · ${VISIT_TIMING[detail.visit.timing]}`}>
          Job{" "}
          <Link href={`/job-cards/${detail.visit.id}`} className="font-mono font-semibold underline-offset-2 hover:underline">{detail.visit.jobNumber}</Link>{" "}
          opened {formatDateTime(detail.visit.date)} at {formatKm(detail.visit.mileage)}.
        </AlertBanner>
      )}
      {detail.closure && (
        <AlertBanner tone="gray" icon={<ShieldX />} title={`Closed · ${detail.closure.reason.code} ${detail.closure.reason.description}`}>
          {detail.closure.remarks ? `${detail.closure.remarks} · ` : ""}
          {formatDateTime(detail.closure.closedAt)}
          {detail.closure.closedBy ? ` by ${detail.closure.closedBy}` : ""}
        </AlertBanner>
      )}
      {detail.booking && (
        <AlertBanner
          tone="blue"
          icon={<CalendarCheck2 />}
          title={`Booked for ${formatDateTime(detail.booking.scheduledAt)}`}
          action={<Button asChild size="sm" variant="outline"><Link href="/appointments">Appointments</Link></Button>}
        >
          Booking {detail.booking.bookingNumber ?? ""} · {detail.booking.status}
        </AlertBanner>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Customer" icon={<User />}>
          {customer ? (
            <div className="space-y-2">
              <p className="text-base font-semibold text-slate-900">{customer.name}</p>
              {customer.contactPerson && <InfoRow icon={<User />}>Contact person: {customer.contactPerson}</InfoRow>}
              {phones.length ? (
                <InfoRow icon={<Phone />}>
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {phones.map((phone) => (
                      <a key={phone} href={`tel:${phone.replace(/\s+/g, "")}`} className="font-medium text-primary hover:underline">{phone}</a>
                    ))}
                  </span>
                </InfoRow>
              ) : (
                <InfoRow icon={<Phone />}><span className="text-amber-700">No phone number on file</span></InfoRow>
              )}
              {customer.email && <InfoRow icon={<Mail />}>{customer.email}</InfoRow>}
              {(customer.address || customer.city) && <InfoRow icon={<MapPin />}>{[customer.address, customer.city].filter(Boolean).join(", ")}</InfoRow>}
              {(customer.preferredFollowupDay || customer.preferredFollowupTime || customer.preferredContactMethod) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {customer.preferredContactMethod && <Pill status={`Prefers ${customer.preferredContactMethod}`} tone="purple" />}
                  {customer.preferredFollowupDay && <Pill status={`Best day: ${customer.preferredFollowupDay}`} tone="purple" />}
                  {customer.preferredFollowupTime && <Pill status={`Best time: ${customer.preferredFollowupTime}`} tone="purple" />}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-amber-700">No customer linked to this vehicle.</p>
          )}
        </Card>
        <Card title="Previous visit" icon={<Wrench />}>
          {detail.lastVisit ? (
            <div className="space-y-2">
              <InfoRow icon={<Car />}>
                Job <Link href={`/job-cards/${detail.lastVisit.id}`} className="font-mono font-semibold text-primary hover:underline">{detail.lastVisit.jobNumber}</Link> · {formatDay(detail.lastVisit.date)}
              </InfoRow>
              <InfoRow icon={<Clock3 />}>Mileage {formatKm(detail.lastVisit.mileage)}</InfoRow>
              <InfoRow icon={<Wrench />}>{detail.lastVisit.serviceType ? `${detail.lastVisit.serviceType.code} · ${detail.lastVisit.serviceType.description}` : "Service not recorded"}</InfoRow>
              <p className="text-xs text-slate-500">Last odometer on file: {formatKm(detail.vehicle.lastRecordedMileage)}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No earlier visit. {detail.vehicle.saleDate ? `Sold ${formatDay(detail.vehicle.saleDate)}.` : ""}</p>
          )}
        </Card>
      </div>

      <History_ detail={detail} stage={stage} />

      {/* Follow-up form */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <PhoneCall className="size-4 text-primary" aria-hidden="true" /> {STAGE_META[stage].title}
          </h3>
          {stageData.closure && <Pill status={`Closed ${stageData.closure.reason.code}`} tone={CLOSURE_TYPE[stageData.closure.reason.closureType].tone} />}
        </header>

        <fieldset disabled={!editable || save.isPending} className="space-y-5 p-4">
          <legend className="sr-only">Calls made</legend>
          <div className="space-y-3">
            {contacts.map((row) => (
              <div key={row.slot} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-[9.5rem_minmax(0,1fr)] lg:grid-cols-[9.5rem_minmax(0,10rem)_minmax(0,1fr)_minmax(0,11rem)]">
                <div>
                  <span className={labelCls}>Call {row.slot}</span>
                  <DateInput value={row.contactDate} max={today} onChange={(value) => update(row.slot, { contactDate: value })} placeholder="Date" />
                </div>
                <label className="block">
                  <span className={labelCls}>Spoke to</span>
                  <input className={inputCls} value={row.contactPerson} maxLength={80} placeholder="Owner, driver…" onChange={(event) => update(row.slot, { contactPerson: event.target.value })} />
                </label>
                <label className="block sm:col-span-2 lg:col-span-1">
                  <span className={labelCls}>Remarks</span>
                  <input className={inputCls} value={row.remarks} maxLength={500} placeholder="What the customer said" onChange={(event) => update(row.slot, { remarks: event.target.value })} />
                </label>
                <label className="block sm:col-span-2 lg:col-span-1">
                  <span className={labelCls}>Done by</span>
                  <select className={inputCls} value={row.doneById} onChange={(event) => update(row.slot, { doneById: event.target.value })}>
                    <option value="">—</option>
                    {(staff.data ?? []).map((person) => (
                      <option key={person.id} value={person.id}>{person.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
            <p className="text-xs text-slate-500">Only lines with a person or remarks are saved. Clearing a saved line removes it.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={cn("space-y-3 rounded-lg border p-3", book ? "border-primary/40 bg-primary/5" : "border-slate-200")}>
              <Toggle
                checked={book}
                onChange={setBook}
                disabled={!!detail.booking}
                label={detail.booking ? "Already booked" : "Book the vehicle in"}
                description={detail.booking ? "Change the booking from Appointments." : "Creates a service booking (or links the vehicle's open one)."}
              />
              {book && (
                <div className="grid gap-3">
                  <div>
                    <span className={labelCls}><CalendarClock className="mr-1 inline size-3.5" />Date and time</span>
                    <DateTimeInput value={scheduledAt} onChange={setScheduledAt} min={today} />
                  </div>
                  <label className="block">
                    <span className={labelCls}>Booking note</span>
                    <input className={inputCls} value={bookingNotes} maxLength={500} placeholder="e.g. prefers a morning slot" onChange={(event) => setBookingNotes(event.target.value)} />
                  </label>
                </div>
              )}
            </div>
            <div className={cn("space-y-3 rounded-lg border p-3", close ? "border-amber-300 bg-amber-50/60" : "border-slate-200")}>
              <Toggle checked={close} onChange={setClose} label="Close with a reason" description="Customer can't or won't come, or call again later." />
              {close && (
                <div className="grid gap-3">
                  <label className="block">
                    <span className={labelCls}>Reason</span>
                    <select className={inputCls} value={reasonId} onChange={(event) => setReasonId(event.target.value)}>
                      <option value="">Choose a reason</option>
                      {(["PARTIAL", "FINAL"] as const).map((type) => (
                        <optgroup key={type} label={CLOSURE_TYPE[type].label}>
                          {(reasons.data ?? []).filter((row) => row.closureType === type).map((row) => (
                            <option key={row.id} value={row.id}>{row.code} · {row.description}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  {reason && <p className={cn("text-xs font-medium", reason.closureType === "FINAL" ? "text-red-700" : "text-amber-800")}>{CLOSURE_TYPE[reason.closureType].hint}</p>}
                  <label className="block">
                    <span className={labelCls}>Reason details</span>
                    <input className={inputCls} value={closeRemarks} maxLength={500} placeholder="Free text" onChange={(event) => setCloseRemarks(event.target.value)} />
                  </label>
                </div>
              )}
            </div>
          </div>
        </fieldset>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <div className="min-h-5 text-sm" aria-live="polite">
            {problem && <span className="font-medium text-red-600">{problem}</span>}
            {!editable && !problem && <span className="text-slate-500">{detail.status === "OPEN" ? "You can view this case but not record follow-ups." : "This case is no longer open for follow-up."}</span>}
          </div>
          {editable && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={save.isPending} onClick={() => submit(false)} className="gap-1.5">
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
              </Button>
              {hasNext && (
                <Button type="button" disabled={save.isPending} onClick={() => submit(true)} className="gap-1.5">
                  Save and next <ChevronRight className="size-4" />
                </Button>
              )}
            </div>
          )}
        </footer>
      </section>
    </div>
  );
}
