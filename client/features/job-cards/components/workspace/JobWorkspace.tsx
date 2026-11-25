"use client";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { NOT_PROVIDED } from "@/lib/format";
import { useJobCard } from "../../hooks/use-job-card";
import { useJobOpeningConsent } from "../../hooks/use-job-opening-consent";
import { useJobStageAction, useJobWorkspace } from "../../hooks/use-job-workspace";
import { useNow } from "../../hooks/use-now";
import {
  actionToast,
  alertViews,
  loadProblem,
  stepperView,
  stepProgress,
  summaryItems,
  waitingMessage,
  type JobFileTab,
} from "../../lib/job-frame.logic";
import { SUB_STEP_LABELS, phoneStepLabel, splitActions, type JobStep } from "../../lib/job-stage.logic";
import type { JobCard } from "../../types/job-card.types";
import type { StageAction } from "../../types/job-workspace.types";
import { AlertStrip } from "./AlertStrip";
import { CancelJobDialog } from "./CancelJobDialog";
import { JobFileDrawer } from "./JobFileDrawer";
import { JobGatePassPrint } from "./JobGatePassPrint";
import { JobHeader, type PrintItem } from "./JobHeader";
import { CancelledPanel, JobFrameSkeleton, JobLoadProblem } from "./JobPageStates";
import { JobStepper } from "./JobStepper";
import { StageActionBar } from "./StageActionBar";
import { StageContent } from "./StageContent";
import { StageSummaryList } from "./StageSummaryList";
import { WaitingBanner } from "./WaitingBanner";

/** The staged job card: one job, one step, one owner. */
export function JobWorkspace({ id }: { id: string }) {
  const job = useJobCard(id);
  const workspace = useJobWorkspace(id);
  const problem = job.error ?? workspace.error;

  // A failed background refresh keeps showing the job; only a failed first load shows the problem.
  if (problem && (!job.data || !workspace.data))
    return (
      <JobLoadProblem
        kind={loadProblem(problem)}
        jobNumber={job.data?.jobNumber}
        retrying={job.isFetching || workspace.isFetching}
        onRetry={() => {
          void job.refetch();
          void workspace.refetch();
        }}
      />
    );
  if (!job.data || !workspace.data) return <JobFrameSkeleton />;
  return <JobFrame job={job.data} />;
}

function JobFrame({ job }: { job: JobCard }) {
  const { data: workspace } = useJobWorkspace(job.id);
  const stageAction = useJobStageAction(job.id);
  const { hasPermission } = useAuth();
  const consent = useJobOpeningConsent(job.id, hasPermission("jobcard:read"));
  const now = useNow();
  const [drawer, setDrawer] = useState<{ open: boolean; tab: JobFileTab }>({ open: false, tab: "customer" });
  const [openStage, setOpenStage] = useState<JobStep | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const openTab = useCallback((tab: JobFileTab) => setDrawer({ open: true, tab }), []);
  const closeDrawer = useCallback(() => setDrawer((current) => ({ ...current, open: false })), []);
  const printGatePass = useCallback(() => window.print(), []);

  if (!workspace) return null;

  const pending = stageAction.isPending ? (stageAction.variables?.action ?? null) : null;
  const run = (action: StageAction, note?: string) => {
    if (stageAction.isPending) return;
    setCancelError(null);
    stageAction.mutate(
      { action, note, requestId: crypto.randomUUID() },
      {
        onSuccess: (next) => {
          toast.success(actionToast(action, next));
          if (action === "CANCEL") setCancelling(false);
        },
        onError: (error) => {
          const message = apiErrorMessage(error, "Could not update the job. Reload the page and try again.");
          if (action === "CANCEL") setCancelError(message);
          else toast.error(message);
        },
      },
    );
  };

  const { primary, secondary, danger } = splitActions(workspace);
  const steps = stepperView(workspace);
  const cancelled = workspace.stage === "CANCELLED";
  const waiting = waitingMessage(workspace);
  const alerts = alertViews(workspace.alerts, {
    canAssign: hasPermission("assignment:create") && ["DIAGNOSIS", "REPAIR"].includes(workspace.stage),
    canSeeParts: workspace.stage === "REPAIR",
  });
  const plate = job.vehicle?.registrationNumber || job.vehicle?.vin || NOT_PROVIDED;

  const latestEstimate = job.estimates?.[0];
  const signature = consent.data?.signature;
  const printItems: PrintItem[] = [
    ...(latestEstimate && hasPermission("estimate:print")
      ? [{ label: "Estimate", href: `/job-cards/${job.id}/estimates/${latestEstimate.id}/print` }]
      : []),
    ...(signature && consent.data?.state !== "invalid" && hasPermission("estimate:print")
      ? [{ label: "Signed job-opening approval", href: `/job-cards/${job.id}/opening-consent/${signature.id}/print` }]
      : []),
    ...(hasPermission("jobcard:picking-list:print") ? [{ label: "Picking list", href: `/service-transactions/job-picking/${job.id}/print` }] : []),
    ...(job.gatePassNumber ? [{ label: "Gate pass", onSelect: printGatePass }] : []),
  ];

  const openSummary = (stage: JobStep) => {
    setOpenStage(stage);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`summary-${stage}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.querySelector("button")?.focus({ preventScroll: true });
    });
  };

  const subStep = workspace.subStep ? SUB_STEP_LABELS[workspace.subStep] : null;
  const currentTitle = cancelled ? "Cancelled job" : workspace.stage === "CLOSED" ? "Closed job" : phoneStepLabel(workspace.stage);

  return (
    <div className="px-4 lg:px-5">
      <JobHeader job={job} workspace={workspace} now={now} printItems={printItems} onOpenJobFile={() => openTab(drawer.tab)} />
      <div className="space-y-4 pt-4 print:hidden">
        <JobStepper
          steps={steps}
          phoneLabel={phoneStepLabel(workspace.stage)}
          progress={stepProgress(workspace)}
          cancelled={cancelled}
          onOpenSummary={openSummary}
        />
        <AlertStrip alerts={alerts} onOpenTab={openTab} />
        {cancelled && <CancelledPanel cancellation={workspace.cancellation} onViewActivity={() => openTab("activity")} />}
        {waiting && <WaitingBanner message={waiting} />}
        <StageSummaryList
          items={summaryItems(workspace, job)}
          openStage={openStage}
          onToggle={(stage) => setOpenStage((current) => (current === stage ? null : stage))}
        />
        {!cancelled && (
          <section aria-labelledby="current-step-title" className="space-y-4">
            <div>
              <h2 id="current-step-title" className="text-base font-semibold">
                {currentTitle}
              </h2>
              {subStep && <p className="text-sm text-muted-foreground">{subStep}</p>}
            </div>
            <StageContent job={job} workspace={workspace} onPrintGatePass={printGatePass} />
          </section>
        )}
      </div>
      <StageActionBar
        primary={primary}
        secondary={secondary}
        danger={danger}
        pending={pending}
        onAction={(action) => run(action)}
        onDangerAction={(action) => {
          if (action === "CANCEL") {
            setCancelError(null);
            setCancelling(true);
          }
        }}
      />
      <div className="pb-4 print:hidden" />
      <JobFileDrawer
        open={drawer.open}
        tab={drawer.tab}
        onTabChange={(tab) => setDrawer({ open: true, tab })}
        onClose={closeDrawer}
        job={job}
        workspace={workspace}
        onPrintGatePass={printGatePass}
      />
      <CancelJobDialog
        key={cancelling ? "open" : "closed"}
        open={cancelling}
        jobNumber={job.jobNumber}
        plate={plate}
        pending={pending === "CANCEL"}
        error={cancelError}
        onConfirm={(reason) => run("CANCEL", reason)}
        onClose={() => setCancelling(false)}
      />
      <JobGatePassPrint job={job} />
    </div>
  );
}
