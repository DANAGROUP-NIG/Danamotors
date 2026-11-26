"use client";
import Link from "next/link";
import { NOT_PROVIDED } from "@/lib/format";
import { ClipboardCheck, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useJobRepeat } from "../hooks/use-repeat-jobs";
import { formatDate, formatDays, formatKm, REPEAT_PERMISSIONS, reasonText, windowText, withinWindow } from "../lib/repeat-job.logic";
import { ReasonChips, RepeatStatusBadge, SourceTag } from "./repeat-ui";

/**
 * The repeat block on the job card: previous job, days and km since, reasons once reviewed. It prints
 * with the job card when the branch's "print repeat block" setting is on.
 */
export function JobCardRepeatPanel({ jobCardId, enabled = true }: { jobCardId: string; enabled?: boolean }) {
  const { hasPermission } = useAuth();
  const { data } = useJobRepeat(jobCardId, enabled);
  const repeat = data?.repeat;
  if (!repeat) return null;

  const inside = withinWindow(repeat.window, repeat.daysDifference, repeat.kmDifference);
  const canOpen = hasPermission(REPEAT_PERMISSIONS.READ);
  const canReview = hasPermission(REPEAT_PERMISSIONS.REVIEW);

  return (
    <section
      aria-label="Repeat job"
      className={cn(
        "rounded-lg border bg-white p-4 sm:p-5 print:break-inside-avoid print:border-border print:p-3",
        repeat.status === "CONFIRMED" ? "border-red-200" : repeat.status === "PENDING_REVIEW" ? "border-amber-200" : "border-border",
        !data.printRepeatBlock && "print:hidden",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Repeat2 className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Repeat job</h2>
          <RepeatStatusBadge status={repeat.status} />
          <SourceTag source={repeat.source} />
        </div>
        {canOpen && (
          <Button asChild size="sm" variant={canReview && repeat.status === "PENDING_REVIEW" ? "default" : "outline"} className="gap-1.5 print:hidden">
            <Link href={`/repeat-jobs/${repeat.id}`}>
              <ClipboardCheck className="size-4" /> {canReview && repeat.status === "PENDING_REVIEW" ? "Review repeat" : "Open review"}
            </Link>
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Previous job</dt>
          <dd className="mt-0.5">
            <Link href={`/job-cards/${repeat.previousJob.id}`} className="font-mono font-semibold text-primary hover:underline print:text-black print:no-underline">
              {repeat.previousJob.jobNumber}
            </Link>
            <span className="ml-1 text-muted-foreground">{formatDate(repeat.previousJob.date)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Back after</dt>
          <dd className={cn("mt-0.5 tabular-nums", inside.days && "font-semibold text-amber-700 print:text-black")}>{formatDays(repeat.daysDifference)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Driven since</dt>
          <dd className={cn("mt-0.5 tabular-nums", inside.km && "font-semibold text-amber-700 print:text-black")}>
            {formatKm(repeat.kmDifference)} <span className="text-xs font-normal text-muted-foreground">(prev. {formatKm(repeat.previousJob.mileage)})</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Previous engineer</dt>
          <dd className="mt-0.5 text-foreground">{repeat.previousEngineer ?? NOT_PROVIDED}</dd>
        </div>
      </dl>

      <div className="mt-3 border-t border-border pt-3 print:border-border">
        {repeat.reasons.length ? (
          <>
            <div className="print:hidden"><ReasonChips reasons={repeat.reasons} /></div>
            <p className="hidden text-sm print:block"><span className="font-semibold">Reasons: </span>{reasonText(repeat.reasons)}</p>
            {repeat.remarks && <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{repeat.remarks}</p>}
            {repeat.reviewedAt && <p className="mt-1 text-xs text-muted-foreground">Reviewed by {repeat.reviewedBy ?? NOT_PROVIDED} on {formatDate(repeat.reviewedAt)}</p>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not reviewed yet{repeat.openingNote ? <>. <span className="text-foreground">Advisor&apos;s note: {repeat.openingNote}</span></> : null}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Branch window: {windowText(repeat.window)}</p>
      </div>
    </section>
  );
}
