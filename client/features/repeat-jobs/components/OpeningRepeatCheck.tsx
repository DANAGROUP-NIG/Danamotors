"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormContext } from "react-hook-form";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CreateJobCardFormValues } from "@/features/job-cards/schemas/job-card.schema";
import { OpeningCard, OpeningField, openingInput } from "@/features/job-cards/components/opening/opening-ui";
import { useRepeatPreview } from "../hooks/use-repeat-jobs";
import { formatDate, formatDays, formatKm, windowText } from "../lib/repeat-job.logic";

const personName = (person: { firstName: string; lastName: string } | null) => (person ? `${person.firstName} ${person.lastName}`.trim() : null);

/**
 * Repeat check on the job opening form. The server flags the job automatically when the vehicle's last
 * billed job is within the branch window (days or km); this card shows that comparison before saving,
 * and lets the advisor flag a repeat by hand (any earlier job) with an optional note. Reasons are
 * recorded later, at review.
 */
export function OpeningRepeatCheck({ vehicleId, branchId, mileage }: { vehicleId: string; branchId?: string; mileage?: number }) {
  const { register, setValue, watch, formState } = useFormContext<CreateJobCardFormValues>();
  const preview = useRepeatPreview(vehicleId, branchId, mileage, true);
  const candidate = preview.data?.candidate ?? null;
  const isRepeat = watch("isRepeat");
  const previousJobId = watch("previousJobId");
  const [linkOther, setLinkOther] = useState(false);
  const autoLinked = useRef<string | null>(null);

  // Follow the automatic candidate: link it while it applies, unlink when the reading moves out of the window.
  useEffect(() => {
    if (candidate && !linkOther) {
      autoLinked.current = candidate.previousJob.id;
      setValue("isRepeat", true, { shouldDirty: true });
      setValue("previousJobId", candidate.previousJob.id, { shouldDirty: true });
    } else if (!candidate && autoLinked.current) {
      autoLinked.current = null;
      setValue("isRepeat", false);
      setValue("previousJobId", "");
    }
  }, [candidate, linkOther, setValue]);

  const history = preview.data?.jobs ?? [];
  const manualPick = isRepeat && (!candidate || linkOther);
  const error = formState.errors.previousJobId?.message;

  return (
    <OpeningCard title="Repeat check" description="Compared with the vehicle's last billed job in any branch (cancelled and PDI jobs ignored).">
      {preview.isLoading && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Checking the vehicle&apos;s last billed job…
        </p>
      )}
      {preview.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not run the repeat check; the job can still be opened and is checked again when saved.{" "}
          <button type="button" className="underline" onClick={() => void preview.refetch()}>Retry</button>
        </p>
      )}

      {preview.data && candidate && (
        <div className="space-y-4">
          <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">
                Repeat job: back {formatDays(candidate.daysDifference)}
                {candidate.kmDifference !== null && ` and ${formatKm(candidate.kmDifference)}`} after job {candidate.previousJob.jobNumber}
              </p>
              <p className="mt-0.5 opacity-90">
                Within the branch window of {windowText(preview.data.window)}
                {candidate.byDays && candidate.byKm ? " (both limits)" : candidate.byDays ? " (by days)" : " (by km)"}. The job is saved as a repeat and sent for
                review; the reason is recorded at review.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm md:grid-cols-4">
            <Item label="Previous job">
              <Link href={`/job-cards/${candidate.previousJob.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono font-semibold text-primary hover:underline">
                {candidate.previousJob.jobNumber} <ExternalLink className="size-3" aria-hidden="true" />
              </Link>
            </Item>
            <Item label="Date">{formatDate(candidate.previousJob.date)}</Item>
            <Item label="Mileage">{formatKm(candidate.previousJob.mileage)}</Item>
            <Item label="Service type">{candidate.previousJob.serviceType ?? "—"}</Item>
            <Item label="Days since" highlight={candidate.byDays}>{formatDays(candidate.daysDifference)}</Item>
            <Item label="Km since" highlight={candidate.byKm}>{formatKm(candidate.kmDifference)}</Item>
            <Item label="Engineer">{candidate.previousJob.engineer ?? "—"}</Item>
            <Item label="Service advisor">{candidate.previousJob.serviceAdvisor ?? "—"}</Item>
            <Item label="Complaint" wide>{candidate.previousJob.description}</Item>
            <Item label="Work done" wide>{candidate.previousJob.workDone ?? <span className="text-slate-400">Not recorded</span>}</Item>
          </dl>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={linkOther} onChange={(event) => { setLinkOther(event.target.checked); if (!event.target.checked && candidate) setValue("previousJobId", candidate.previousJob.id); }} />
            This visit repeats a different earlier job
          </label>
        </div>
      )}

      {preview.data && !candidate && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <p>
              <span className="font-semibold">No repeat detected.</span>{" "}
              {history.some((job) => job.billedAt || ["BILLED", "DELIVERED", "Billed", "Closed"].includes(job.status))
                ? `The last billed job is outside the branch window of ${windowText(preview.data.window)}.`
                : "The vehicle has no earlier billed job."}
            </p>
          </div>
          {history.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...register("isRepeat")} /> Flag as a repeat job by hand
            </label>
          )}
        </div>
      )}

      {preview.data && (isRepeat || linkOther) && (
        <div className={cn("mt-4 grid gap-4", manualPick && "md:grid-cols-2")}>
          {manualPick && (
            <OpeningField label="Previous job" required error={error}>
              <select className={openingInput} aria-invalid={!!error} {...register("previousJobId")}>
                <option value="">Select the job this visit repeats</option>
                {history.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.jobNumber} — {formatDate(job.createdAt)} — {formatKm(job.mileage)}
                    {personName(job.technician) ? ` — ${personName(job.technician)}` : ""}
                    {job.billedAt ? "" : " (not billed)"}
                  </option>
                ))}
              </select>
            </OpeningField>
          )}
          <OpeningField label="Note for the reviewer (optional)">
            <textarea className={`${openingInput} h-20 py-2`} maxLength={2000} placeholder="e.g. Customer says the same AC noise is back" {...register("repeatReason")} />
          </OpeningField>
          {manualPick && previousJobId && candidate?.previousJob.id !== previousJobId && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500 md:col-span-2">
              <Repeat2 className="size-3.5" aria-hidden="true" /> Flagged by hand: the record shows as manual and waits for review.
            </p>
          )}
        </div>
      )}
    </OpeningCard>
  );
}

function Item({ label, children, highlight, wide }: { label: string; children: ReactNode; highlight?: boolean; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className={cn("mt-0.5 break-words text-slate-700", highlight && "font-semibold text-amber-700")}>{children}</dd>
    </div>
  );
}
