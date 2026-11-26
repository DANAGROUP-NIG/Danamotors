"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, ClipboardCheck, Gauge, History, Keyboard, Loader2, Lock, MessageSquareText, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertBanner, DetailField, PageState, SectionCard } from "@/features/warranty/components/ui";
import { cn } from "@/lib/utils";
import { useRepeatJob, useRepeatReasons, useReviewRepeatJob } from "../hooks/use-repeat-jobs";
import { formatDate, formatDateTime, formatDays, formatKm, MAX_REPEAT_REASONS, REPEAT_SOURCE, reviewProblem, toggleReason, windowText, withinWindow } from "../lib/repeat-job.logic";
import type { ComparedJob, RepeatDetail, RepeatReasonOption } from "../types/repeat-job.types";
import { DifferenceTile, ReasonChips, RepeatStatusBadge, SourceTag } from "./repeat-ui";

export function RepeatReviewPage({ id }: { id: string }) {
  const detail = useRepeatJob(id);
  const reasons = useRepeatReasons();

  if (detail.isLoading || reasons.isLoading) return <PageState loading message="Loading repeat job…" />;
  if (detail.isError || !detail.data)
    return (
      <div className="px-4 py-6 lg:px-6">
        <AlertBanner tone="red" icon={<History />} title="Could not load this repeat job" action={<Button variant="outline" size="sm" onClick={() => void detail.refetch()}>Retry</Button>}>
          It may be in another branch, or the link is out of date. <Link href="/repeat-jobs" className="underline">Back to repeat jobs</Link>
        </AlertBanner>
      </div>
    );
  // Remount the form when another record (or a saved version) loads, so its state starts from the server.
  return <ReviewScreen key={`${detail.data.id}-${detail.data.reviewedAt ?? "new"}`} detail={detail.data} reasons={reasons.data ?? []} />;
}

function ReviewScreen({ detail, reasons }: { detail: RepeatDetail; reasons: RepeatReasonOption[] }) {
  const router = useRouter();
  const review = useReviewRepeatJob(detail.id);
  const [selected, setSelected] = useState<string[]>(detail.reasons.map((reason) => reason.id));
  const [remarks, setRemarks] = useState(detail.remarks ?? "");
  const [touched, setTouched] = useState(false);
  const inside = withinWindow(detail.window, detail.daysDifference, detail.kmDifference);
  const editable = detail.canReview;
  const nextPending = detail.olderPendingId ?? detail.newerPendingId;

  // Inactive reasons stay visible only where the record already uses them.
  const options = useMemo(() => reasons.filter((reason) => reason.active || selected.includes(reason.id)), [reasons, selected]);
  const notRepeatIds = useMemo(() => reasons.filter((reason) => reason.isNotRepeat).map((reason) => reason.id), [reasons]);
  const dismissing = selected.some((id) => notRepeatIds.includes(id));
  const problem = reviewProblem(selected, remarks);
  const dirty = selected.join() !== detail.reasons.map((reason) => reason.id).join() || remarks.trim() !== (detail.remarks ?? "");

  const toggle = (reason: RepeatReasonOption) => {
    setTouched(true);
    setSelected((current) => toggleReason(current, reason, notRepeatIds));
  };

  // Legacy entry was by code: typing a reason code toggles it (outside text fields).
  useEffect(() => {
    if (!editable) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.closest("input, textarea, select, [contenteditable=true]")) return;
      const reason = options.find((option) => option.code === event.key);
      if (reason) {
        event.preventDefault();
        setTouched(true);
        setSelected((current) => toggleReason(current, reason, notRepeatIds));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, options, notRepeatIds]);

  const save = (goNext: boolean) => {
    setTouched(true);
    if (problem) return;
    review.mutate(
      { reasonIds: selected, remarks: remarks.trim() },
      { onSuccess: () => router.push(goNext && nextPending ? `/repeat-jobs/${nextPending}` : goNext ? "/repeat-jobs" : `/repeat-jobs/${detail.id}`) },
    );
  };

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/repeat-jobs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Repeat jobs
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" disabled={!detail.newerPendingId} className="gap-1">
            {detail.newerPendingId ? <Link href={`/repeat-jobs/${detail.newerPendingId}`}><ArrowLeft className="size-4" /> Newer pending</Link> : <span><ArrowLeft className="size-4" /> Newer pending</span>}
          </Button>
          <Button asChild variant="outline" size="sm" disabled={!detail.olderPendingId} className="gap-1">
            {detail.olderPendingId ? <Link href={`/repeat-jobs/${detail.olderPendingId}`}>Older pending <ArrowRight className="size-4" /></Link> : <span>Older pending <ArrowRight className="size-4" /></span>}
          </Button>
        </div>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Repeat job review</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">
            <span className="font-mono">{detail.job.jobNumber}</span>
            <RepeatStatusBadge status={detail.status} />
            <SourceTag source={detail.source} />
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {detail.job.registration ?? "No registration"} · {[detail.job.model, detail.job.variant].filter(Boolean).join(" · ") || "Model not set"}
            {detail.job.vin && <span className="ml-1 font-mono text-xs">· {detail.job.vin}</span>}
          </p>
        </div>
        <div className="text-right text-sm text-slate-500">
          <p>Flagged {formatDateTime(detail.flaggedAt)} ({REPEAT_SOURCE[detail.source].toLowerCase()})</p>
          {detail.reviewedAt && <p>Reviewed by {detail.reviewedBy?.name ?? "—"} · {formatDateTime(detail.reviewedAt)}</p>}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <DifferenceTile label="Back after" value={formatDays(detail.daysDifference)} limit={detail.window.days === null ? "not recorded" : `${detail.window.days} days`} triggered={inside.days} />
        <DifferenceTile
          label="Driven since"
          value={formatKm(detail.kmDifference)}
          limit={detail.window.km === null ? "days only" : `${detail.window.km.toLocaleString("en-GB")} km`}
          triggered={inside.km}
          hint={detail.kmDifference === null ? "A reading is missing or lower than before (odometer replaced)." : undefined}
        />
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Counts against</p>
          <p className="mt-1 text-base font-semibold text-slate-900">{detail.previousJob.technicians.filter(Boolean).join(", ") || detail.previousJob.technician || detail.previousJob.engineer || "Not assigned"}</p>
          <p className="text-sm text-slate-500">Service advisor: {detail.previousJob.serviceAdvisor ?? "—"}</p>
          <p className="mt-1 text-xs text-slate-400">Branch window when flagged: {windowText(detail.window)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <JobColumn title="Previous job" tone="previous" job={detail.previousJob} technicians={detail.previousJob.technicians} />
        <JobColumn title="This visit" tone="current" job={detail.job} />
      </div>

      <SectionCard
        icon={<ClipboardCheck />}
        title="Review"
        note={editable ? `${selected.length} / ${MAX_REPEAT_REASONS} reasons` : undefined}
        action={
          editable ? (
            <span className="hidden items-center gap-1 text-xs text-slate-400 md:inline-flex">
              <Keyboard className="size-3.5" aria-hidden="true" /> Type a code (0–9) to toggle it
            </span>
          ) : undefined
        }
      >
        {detail.openingNote && (
          <div className="mb-4 flex gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <MessageSquareText className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
            <p>
              <span className="font-semibold">Advisor&apos;s note at opening: </span>
              {detail.openingNote}
            </p>
          </div>
        )}

        {!editable ? (
          <div className="space-y-4">
            <AlertBanner tone="gray" icon={<Lock />} title={detail.status === "PENDING_REVIEW" ? "You can view this repeat job but not review it" : "Reviewed — only the reviewer or an Admin can change it"} />
            <DetailField label="Reasons" value={<ReasonChips reasons={detail.reasons} />} />
            <DetailField label="Remarks" value={detail.remarks ? <span className="whitespace-pre-wrap">{detail.remarks}</span> : "—"} />
          </div>
        ) : (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-slate-800">Why did the vehicle come back?</legend>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {options.map((reason) => {
                  const position = selected.indexOf(reason.id);
                  const active = position !== -1;
                  return (
                    <button
                      key={reason.id}
                      type="button"
                      role="checkbox"
                      aria-checked={active}
                      onClick={() => toggle(reason)}
                      className={cn(
                        "group flex min-h-16 items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        reason.isNotRepeat && "sm:col-span-2 xl:col-span-4",
                        active && reason.isNotRepeat && "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500",
                        active && !reason.isNotRepeat && "border-primary bg-primary/5 ring-1 ring-primary",
                        !active && "border-slate-200 bg-white hover:bg-slate-50",
                        !active && dismissing && !reason.isNotRepeat && "opacity-60",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold",
                          active ? (reason.isNotRepeat ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground") : "bg-slate-100 text-slate-600",
                        )}
                      >
                        {reason.code}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-800">{reason.description}</span>
                        <span className="block text-xs text-slate-500">
                          {reason.isNotRepeat ? "Dismisses the flag: the job stays in history but leaves repeat counts. Cannot be combined." : active ? `Reason ${position + 1}` : !reason.active ? "No longer in use" : "Counts as a repeat"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {selected.length >= MAX_REPEAT_REASONS && !dismissing && <p className="mt-2 text-xs text-amber-700">Five reasons is the most a review can hold. Remove one to choose another.</p>}
            </fieldset>

            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-slate-800">
                Remarks <span className="text-destructive" aria-hidden="true">*</span>
              </span>
              <textarea
                className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                maxLength={2000}
                placeholder={dismissing ? "Why this is not a repeat, e.g. a different complaint or a scheduled service." : "What went wrong on the previous job, and what was done this time."}
                value={remarks}
                aria-invalid={touched && !remarks.trim()}
                onChange={(event) => setRemarks(event.target.value)}
              />
              <span className="flex justify-between text-xs text-slate-400">
                <span>{touched && problem ? <span className="text-destructive">{problem}</span> : "Required with every review."}</span>
                <span>{remarks.length} / 2000</span>
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
              {detail.status !== "PENDING_REVIEW" && !dirty && <span className="mr-auto text-xs text-slate-400">Saved. Change the reasons or remarks to update the review.</span>}
              <Button variant="outline" disabled={review.isPending || !dirty} onClick={() => save(false)}>
                {review.isPending && <Loader2 className="size-4 animate-spin" />} Save
              </Button>
              <Button disabled={review.isPending || !dirty} onClick={() => save(true)} className="gap-1.5">
                {review.isPending && <Loader2 className="size-4 animate-spin" />}
                {nextPending ? "Save & next pending" : "Save & back to list"} <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function JobColumn({ title, tone, job, technicians }: { title: string; tone: "previous" | "current"; job: ComparedJob; technicians?: (string | null)[] }) {
  return (
    <SectionCard
      icon={tone === "previous" ? <History /> : <Wrench />}
      title={title}
      note={<span className={cn("rounded-full px-2 py-0.5 font-medium", tone === "previous" ? "bg-slate-100 text-slate-600" : "bg-primary/10 text-primary")}>{job.branch}</span>}
      action={
        <Link href={`/job-cards/${job.id}`} className="font-mono text-sm font-semibold text-primary hover:underline">
          {job.jobNumber}
        </Link>
      }
      className={cn(tone === "current" && "border-primary/30")}
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <DetailField label="Date" value={<span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5 text-slate-400" />{formatDate(job.date)}</span>} />
        <DetailField label="Mileage" value={<span className="inline-flex items-center gap-1 tabular-nums"><Gauge className="size-3.5 text-slate-400" />{formatKm(job.mileage)}</span>} />
        <DetailField label="Service type" value={job.serviceType} />
        <DetailField label="Service advisor" value={job.serviceAdvisor} />
        <DetailField label="Technician" value={technicians?.filter(Boolean).join(", ") || job.technician || job.engineer} />
      </div>
      <div className="mt-5 space-y-4">
        <Block title="Customer requests">
          {job.customerRequests.length ? (
            <ul className="space-y-1.5">
              {job.customerRequests.map((request) => (
                <li key={request.id} className="flex gap-2 text-sm text-slate-700">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                  <span>
                    {request.code && <span className="mr-1 font-mono text-xs text-slate-500">{request.code}</span>}
                    {request.description}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-700">{job.description}</p>
          )}
        </Block>
        <Block title="Work done">
          {job.workDone ? <p className="whitespace-pre-wrap text-sm text-slate-700">{job.workDone}</p> : <p className="text-sm text-slate-400">{tone === "current" ? "Not recorded yet" : "Not recorded"}</p>}
          {job.labour.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {job.labour.map((line) => (
                <li key={line.id} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {line.code && <span className="mr-1 font-mono">{line.code}</span>}
                  {line.description}
                </li>
              ))}
            </ul>
          )}
        </Block>
        {job.observations && (
          <Block title="Observations">
            <p className="whitespace-pre-wrap text-sm text-slate-700">{job.observations}</p>
          </Block>
        )}
      </div>
    </SectionCard>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
      {children}
    </div>
  );
}
