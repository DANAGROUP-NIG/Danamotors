"use client";
import { useEffect, useMemo, useState } from "react";
import { Bell, ClipboardList, FileText, Landmark, Loader2, Phone, Printer, RefreshCw, ShieldOff, UserRound } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useJobEstimate, useNotifyCashier, usePrepareEstimate, usePresentEstimate, useSaveEstimateDraft } from "../../hooks/use-job-estimate";
import {
  TAB_LABELS,
  advanceMissingReason,
  currentTab,
  draftFromLines,
  draftPayload,
  estimateTitle,
  percentProblem,
  quantityProblem,
  type DraftLine,
  type EstimateTab,
} from "../../lib/estimate.logic";
import type { JobCard } from "../../types/job-card.types";
import type { JobEstimateStep } from "../../types/job-estimate.types";
import type { StageBarProps } from "../check-in/CheckInStep";
import { StageActionBar } from "../workspace/StageActionBar";
import { StageCard } from "../workspace/StageCard";
import { AdvanceRelease, ExemptionCard } from "./AdvanceRelease";
import { CustomerApproval } from "./CustomerApproval";
import { DeclinedAll } from "./DeclinedAll";
import { EstimateLinesEditor, EstimateSummary, draftTotals } from "./EstimatePrepare";
import { EstimateReadOnly } from "./EstimateReadOnly";
import { PhoneApprovalDialog } from "./PhoneApprovalDialog";

const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status;
const TAB_ICONS = { PREPARE: FileText, APPROVAL: UserRound, ADVANCE: Landmark } as const;

export function EstimateAccessDenied() {
  return (
    <StageCard title="Estimate">
      <p className="flex items-start gap-2 text-sm">
        <ShieldOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>You do not have access to estimates. The service advisor prepares the estimate, takes the customer&apos;s approval and releases the job to the workshop.</span>
      </p>
    </StageCard>
  );
}

function LoadProblem({ onRetry, fetching }: { onRetry: () => void; fetching: boolean }) {
  return (
    <StageCard title="Estimate">
      <p role="alert" className="text-sm">
        The estimate could not be loaded. Check your connection and try again.
      </p>
      <div>
        <Button type="button" variant="outline" disabled={fetching} onClick={onRetry}>
          {fetching ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          Try again
        </Button>
      </div>
    </StageCard>
  );
}

/** The estimate, read only: a finished step's summary, and other staff while the job is at the estimate. */
export function EstimateEvidence({ jobCardId }: { jobCardId: string }) {
  const query = useJobEstimate(jobCardId);
  if (query.isLoading) return <LoadingSkeleton label="Loading the estimate" />;
  if (statusOf(query.error) === 403) return <EstimateAccessDenied />;
  if (query.isError || !query.data) return <LoadProblem onRetry={() => void query.refetch()} fetching={query.isFetching} />;
  return <EstimateReadOnly step={query.data} />;
}

/** Step 4: Prepare, Customer approval, Advance and release (or the all-declined path). */
export function EstimateStep({ job, bar, readOnly }: { job: JobCard; bar: StageBarProps; readOnly: boolean }) {
  const query = useJobEstimate(job.id);
  if (query.isLoading)
    return (
      <>
        <LoadingSkeleton label="Loading the estimate" />
        <StageActionBar {...bar} primary={null} secondary={[]} />
      </>
    );
  if (statusOf(query.error) === 403)
    return (
      <>
        <EstimateAccessDenied />
        <StageActionBar {...bar} />
      </>
    );
  if (query.isError || !query.data)
    return (
      <>
        <LoadProblem onRetry={() => void query.refetch()} fetching={query.isFetching} />
        <StageActionBar {...bar} primary={null} secondary={[]} />
      </>
    );
  const step = query.data;
  if (readOnly || !step.access.canEdit)
    return (
      <>
        <EstimateReadOnly step={step} />
        {/* A manager decides the waiver, or records that no advance is needed, from the read-only step. */}
        {step.estimate?.outcome === "ALL_DECLINED" && step.estimationCharge && <DeclinedAll step={step} onCloseJob={() => bar.onDangerAction("CANCEL")} />}
        {step.estimate?.approval && step.estimate.outcome !== "ALL_DECLINED" && step.access.canExempt && <ExemptionCard step={step as DraftStep} />}
        <StageActionBar {...bar} />
      </>
    );
  return <EstimateWork key={step.estimate?.id ?? "none"} job={job} step={step} bar={bar} />;
}

function EstimateWork({ job, step, bar }: { job: JobCard; step: JobEstimateStep; bar: StageBarProps }) {
  const { hasPermission } = useAuth();
  const live = currentTab(step);
  const [tab, setTab] = useState<EstimateTab>(live);
  useEffect(() => setTab(live), [live]);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const estimate = step.estimate;
  const declined = estimate?.outcome === "ALL_DECLINED";

  // A fragment, as the other steps: the sticky bar then sticks within the whole step section.
  return (
    <>
      {estimate && !declined && (
        <nav aria-label="Estimate steps" className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1">
          {(["PREPARE", "APPROVAL", "ADVANCE"] as const).map((value, index) => {
            const Icon = TAB_ICONS[value];
            const reachable = index <= ["PREPARE", "APPROVAL", "ADVANCE"].indexOf(live);
            return (
              <button
                key={value}
                type="button"
                disabled={!reachable}
                aria-current={tab === value ? "step" : undefined}
                onClick={() => setTab(value)}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                  tab === value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {/* Phones show the current part's name only; the others keep their name for screen readers. */}
                <span className={cn("truncate", tab !== value && "sr-only sm:not-sr-only")}>{TAB_LABELS[value]}</span>
              </button>
            );
          })}
        </nav>
      )}

      {!estimate ? (
        <PrepareFirst job={job} step={step} bar={bar} />
      ) : declined ? (
        <>
          <EstimateReadOnly step={step} compact />
          <DeclinedAll step={step} onCloseJob={() => bar.onDangerAction("CANCEL")} />
          <StageActionBar {...bar} />
        </>
      ) : tab === "PREPARE" && estimate.approval ? (
        <>
          <EstimateReadOnly step={step} />
          <StageActionBar {...bar} primary={null} secondary={[]} />
        </>
      ) : tab === "PREPARE" ? (
        <DraftEditor job={job} step={step as DraftStep} bar={bar} decided={!!estimate.approval} onPhone={() => setPhoneOpen(true)} canPrint={hasPermission("estimate:print")} />
      ) : tab === "APPROVAL" ? (
        <>
          {estimate.approval ? <EstimateReadOnly step={step} compact /> : <CustomerApproval step={step as DraftStep} />}
          <StageActionBar
            {...bar}
            primary={null}
            secondary={[]}
            back={{ label: "Back to prepare", onClick: () => setTab("PREPARE") }}
            extra={
              step.access.canSign && !estimate.approval ? (
                <Button type="button" variant="outline" onClick={() => setPhoneOpen(true)}>
                  <Phone aria-hidden="true" />
                  Record phone approval
                </Button>
              ) : undefined
            }
          />
        </>
      ) : (
        <>
          <AdvanceRelease step={step as DraftStep} job={job} />
          <ReleaseBar step={step} bar={bar} />
        </>
      )}
      {estimate && !estimate.approval && step.access.canSign && (
        <PhoneApprovalDialog
          key={phoneOpen ? "open" : "closed"}
          jobCardId={step.jobCardId}
          jobNumber={step.jobNumber}
          customerName={step.customerName}
          estimate={estimate}
          open={phoneOpen}
          onClose={() => setPhoneOpen(false)}
        />
      )}
    </>
  );
}

type DraftStep = JobEstimateStep & { estimate: NonNullable<JobEstimateStep["estimate"]> };

function PrepareFirst({ job, step, bar }: { job: JobCard; step: JobEstimateStep; bar: StageBarProps }) {
  const prepare = usePrepareEstimate(job.id);
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <>
      <StageCard title="Estimate">
        {step.canPrepare ? (
          <p className="text-sm">
            The diagnosis has {step.findingsCount} {step.findingsCount === 1 ? "item" : "items"} of work and parts. Prepare the estimate to price them from the catalogue. Who pays for each item comes from the warranty check.
          </p>
        ) : (
          <p className="flex items-start gap-2 text-sm">
            <ClipboardList className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            No findings yet. The diagnosis has no work or parts and the job has no service type, so there is nothing to price. Ask the workshop supervisor to complete the diagnosis.
          </p>
        )}
      </StageCard>
      <StageActionBar
        {...bar}
        primary={null}
        secondary={[]}
        next={
          step.canPrepare
            ? {
                label: "Prepare estimate",
                pending: prepare.isPending,
                pendingLabel: "Preparing estimate",
                onClick: () => {
                  if (prepare.isPending) return;
                  prepare
                    .mutateAsync(requestId)
                    .then(() => toast.success(`Estimate prepared for job ${step.jobNumber}`))
                    .catch((error: unknown) => toast.error(apiErrorMessage(error, "The estimate was not prepared. Check your connection and try again.")));
                },
              }
            : undefined
        }
      />
    </>
  );
}

function DraftEditor({ job, step, bar, decided, onPhone, canPrint }: { job: JobCard; step: DraftStep; bar: StageBarProps; decided: boolean; onPhone: () => void; canPrint: boolean }) {
  const { estimate } = step;
  const save = useSaveEstimateDraft(job.id);
  const present = usePresentEstimate(job.id);
  const original = useMemo(() => draftFromLines(estimate.lines), [estimate.lines]);
  const [lines, setLines] = useState<DraftLine[]>(original);
  const [percent, setPercent] = useState(String(Number(estimate.upfrontPaymentPercent)));
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => setLines(original), [original]);
  const editable = !decided;
  const dirty = JSON.stringify(lines) !== JSON.stringify(original) || Number(percent) !== Number(estimate.upfrontPaymentPercent);
  const invalid = lines.some((line) => quantityProblem(line.quantity)) || !!percentProblem(percent) || lines.length === 0;
  const totals = dirty ? draftTotals(lines, estimate.vatRate) : estimate.totals;
  const busy = save.isPending || present.isPending;

  async function saveDraft(silent = false) {
    if (invalid) {
      setFailure(lines.length === 0 ? "Add at least one line to the estimate" : "Fix the highlighted fields, then save again.");
      return false;
    }
    setFailure(null);
    try {
      await save.mutateAsync({ estimateId: estimate.id, updatedAt: estimate.updatedAt, upfrontPaymentPercent: Number(percent), lines: draftPayload(lines) });
      if (!silent) toast.success(`Estimate saved for job ${step.jobNumber}`);
      return true;
    } catch (error) {
      setFailure(apiErrorMessage(error, "The estimate was not saved. Your changes are still here. Check your connection and save again."));
      return false;
    }
  }

  async function presentToCustomer() {
    if (busy) return;
    if (dirty && !(await saveDraft(true))) return;
    present
      .mutateAsync(estimate.id)
      .then(() => toast.success("Estimate ready for the customer. Hand the tablet to the customer."))
      .catch((error: unknown) => setFailure(apiErrorMessage(error, "The estimate was not presented. Check your connection and try again.")));
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <StageCard
          title={estimateTitle(estimate)}
          actions={
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {save.isPending ? "Saving" : dirty ? "Not saved" : `Last saved: ${formatDateTime(estimate.updatedAt)}`}
            </span>
          }
        >
          <EstimateLinesEditor jobCardId={job.id} lines={lines} editable={editable} saving={busy} onChange={setLines} />
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
          {estimate.presentedAt && !decided && (
            <p className="text-sm text-muted-foreground">Presented to the customer {formatDateTime(estimate.presentedAt)}. Saving a change takes it back to draft.</p>
          )}
        </StageCard>
        <EstimateSummary totals={totals} vatRate={estimate.vatRate} percent={percent} editable={editable} saving={busy} promisedAt={job.promisedAt ?? null} onPercent={setPercent} />
      </div>
      <StageActionBar
        {...bar}
        primary={null}
        secondary={[]}
        onSaveDraft={editable && dirty ? () => void saveDraft() : undefined}
        savingDraft={save.isPending}
        status={
          canPrint ? (
            <Button asChild variant="outline">
              <Link href={`/job-cards/${job.id}/estimates/${estimate.id}/print`}>
                <Printer aria-hidden="true" />
                <span className="hidden sm:inline">Print estimate</span>
              </Link>
            </Button>
          ) : undefined
        }
        extra={
          editable && step.access.canSign ? (
            <Button type="button" variant="outline" disabled={busy} onClick={onPhone}>
              <Phone aria-hidden="true" />
              <span className="hidden sm:inline">Record phone approval</span>
              <span className="sm:hidden">Phone approval</span>
            </Button>
          ) : undefined
        }
        next={editable ? { label: "Present to customer", onClick: () => void presentToCustomer(), pending: busy, pendingLabel: save.isPending ? "Saving" : "Presenting" } : undefined}
      />
    </>
  );
}

function ReleaseBar({ step, bar }: { step: JobEstimateStep; bar: StageBarProps }) {
  const notify = useNotifyCashier(step.jobCardId);
  const advanceMissing = step.advance.required && Number(step.advance.received) <= 0;
  const blockedReason =
    bar.primary && !bar.primary.enabled
      ? bar.primary.reasons.map((reason) => (/cashier to record the advance/i.test(reason) ? advanceMissingReason(step.advance.cashiers) : reason)).join(" ")
      : undefined;
  return (
    <StageActionBar
      {...bar}
      blockedReason={blockedReason}
      note={step.technician ? `${step.technician} will be notified.` : undefined}
      extra={
        advanceMissing ? (
          <Button
            type="button"
            variant="outline"
            disabled={notify.isPending}
            onClick={() =>
              notify
                .mutateAsync(crypto.randomUUID())
                .then((result) => toast.success(`Notice sent to ${result.notified.join(", ")}`))
                .catch((error: unknown) => toast.error(apiErrorMessage(error, "The cashier was not notified. Check your connection and try again.")))
            }
          >
            {notify.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Bell aria-hidden="true" />}
            Notify cashier
          </Button>
        ) : undefined
      }
    />
  );
}

