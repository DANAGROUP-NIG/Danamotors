"use client";
import { Info, Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { formatTime } from "@/lib/format";
import { useJobQualityCheck } from "../../hooks/use-job-quality-check";
import { WORK_STATUS_BADGE } from "../../lib/repair.logic";
import { QC_STATE_LABEL } from "../../lib/quality-check.logic";
import type { JobCard } from "../../types/job-card.types";
import type { JobQualityCheckStep } from "../../types/job-quality-check.types";
import type { JobWorkspace } from "../../types/job-workspace.types";
import type { StageBarProps } from "../check-in/CheckInStep";
import { StageActionBar } from "../workspace/StageActionBar";
import { StageCard } from "../workspace/StageCard";
import { WorkDoneSection } from "../workspace/WorkshopSections";
import { QcHistory } from "./QcHistory";
import { QualityCheckForm } from "./QualityCheckForm";

const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status;

/**
 * Step 6: Quality check. The workshop supervisor (or service manager) records it on the form;
 * everyone else sees the approved work, the result so far and every earlier check, read only.
 */
export function QualityCheckStep({ job, workspace, bar }: { job: JobCard; workspace: JobWorkspace; bar: StageBarProps }) {
  const query = useJobQualityCheck(job.id);
  const quiet = { ...bar, primary: null, secondary: [] };
  if (query.isLoading)
    return (
      <>
        <LoadingSkeleton label="Loading the quality check" />
        <StageActionBar {...quiet} />
      </>
    );
  if (statusOf(query.error) === 403)
    return (
      <>
        <StageCard title="Quality check">
          <p className="flex items-start gap-2 text-sm">
            <ShieldOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>You do not have access to this job&apos;s quality check. Staff of the job&apos;s branch with access to job cards can open it.</span>
          </p>
        </StageCard>
        <StageActionBar {...quiet} />
      </>
    );
  if (query.isError || !query.data)
    return (
      <>
        <StageCard title="Quality check">
          <p role="alert" className="text-sm">
            The quality check could not be loaded. Check your connection and try again.
          </p>
          <div>
            <Button type="button" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
              {query.isFetching ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              Try again
            </Button>
          </div>
        </StageCard>
        <StageActionBar {...quiet} />
      </>
    );
  const step = query.data;
  if (step.access.canRecord && !workspace.readOnly)
    return (
      <QualityCheckForm job={job} step={step} bar={bar}>
        {/* Work done and recommendations stay editable for the supervisor until billing. */}
        <WorkDoneSection job={job} />
      </QualityCheckForm>
    );
  return (
    <>
      <QualityCheckReadOnly step={step} reason={step.access.reason} />
      <StageActionBar {...quiet} />
    </>
  );
}

/** What everyone else sees: the work waiting for the check, the result so far and the history. */
function QualityCheckReadOnly({ step, reason }: { step: JobQualityCheckStep; reason: string | null }) {
  return (
    <>
      <StageCard title="Quality check" description={`Result: ${QC_STATE_LABEL[step.state]}`}>
        {reason && (
          <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {reason}
          </p>
        )}
        {step.workLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No approved work is listed for this job.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {step.workLines.map((line) => {
              const badge = WORK_STATUS_BADGE[line.status];
              return (
                <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
                  <span className="min-w-0 flex-1 break-words font-medium">{line.description}</span>
                  <StatusBadge status={line.status === "DONE" && line.doneAt ? `Done ${formatTime(line.doneAt)}` : badge.label} tone={badge.tone} className="text-xs normal-case" />
                </li>
              );
            })}
          </ul>
        )}
      </StageCard>
      <QcHistory history={step.history} title="Quality checks" />
    </>
  );
}
