"use client";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, CircleCheck, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { cn } from "@/lib/utils";
import { useJobCheckIn, useSaveCheckInDetails, useWalkAroundAutosave } from "../../hooks/use-job-check-in";
import {
  checkInStepViews,
  detailsErrorField,
  detailsPayload,
  firstOpenStep,
  saveStateText,
  type DetailsValues,
  type SaveState,
} from "../../lib/check-in.logic";
import type { JobFileTab } from "../../lib/job-frame.logic";
import type { JobCard } from "../../types/job-card.types";
import type { CheckInStepKey, JobCheckIn } from "../../types/job-check-in.types";
import type { JobWorkspace, StageAction, StageActionView } from "../../types/job-workspace.types";
import { StageActionBar } from "../workspace/StageActionBar";
import { StageCard } from "../workspace/StageCard";
import { ConsentStep } from "./ConsentStep";
import { DetailsStep } from "./DetailsStep";
import { WalkAroundStep } from "./WalkAroundStep";

/** The frame's action bar inputs; check-in shows its own bar with step navigation around them. */
export interface StageBarProps {
  primary: StageActionView | null;
  secondary: StageActionView[];
  danger: StageActionView[];
  pending: StageAction | null;
  onAction: (action: StageAction) => void;
  onDangerAction: (action: StageAction) => void;
}

/** Check-in: Details, Walk-around and Customer consent, then the handoff to the workshop supervisor. */
export function CheckInStep({
  job,
  workspace,
  bar,
  onOpenTab,
}: {
  job: JobCard;
  workspace: JobWorkspace;
  bar: StageBarProps;
  onOpenTab: (tab: JobFileTab) => void;
}) {
  const query = useJobCheckIn(job.id);
  if (query.isLoading)
    return (
      <>
        <LoadingSkeleton label="Loading check-in" />
        <StageActionBar {...bar} primary={null} secondary={[]} />
      </>
    );
  if (query.isError || !query.data)
    return (
      <>
        <StageCard title="Check-in">
          <p role="alert" className="text-sm">
            Check-in could not be loaded. Check your connection and try again.
          </p>
          <Button type="button" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
            {query.isFetching && <Loader2 className="animate-spin" aria-hidden="true" />}
            Try again
          </Button>
        </StageCard>
        <StageActionBar {...bar} />
      </>
    );
  return <CheckInLoaded job={job} workspace={workspace} checkIn={query.data} bar={bar} onOpenTab={onOpenTab} />;
}

function CheckInLoaded({
  job,
  workspace,
  checkIn,
  bar,
  onOpenTab,
}: {
  job: JobCard;
  workspace: JobWorkspace;
  checkIn: JobCheckIn;
  bar: StageBarProps;
  onOpenTab: (tab: JobFileTab) => void;
}) {
  const editable = checkIn.editable && !workspace.readOnly;
  const [step, setStep] = useState<CheckInStepKey>(() => firstOpenStep(checkIn));
  const [serverErrors, setServerErrors] = useState<{ field: keyof DetailsValues; message: string }[]>([]);
  const intent = useRef<"draft" | "continue">("continue");
  const saveDetails = useSaveCheckInDetails(job.id);
  const walkAround = useWalkAroundAutosave(job.id, checkIn.record, editable);
  const [leaving, setLeaving] = useState(false);
  const formId = useId();
  const tabsId = useId();
  const views = checkInStepViews(checkIn.gates, step);

  const go = async (next: CheckInStepKey) => {
    if (next === step) return;
    if (step === "WALK_AROUND" && editable && walkAround.pending()) {
      setLeaving(true);
      const saved = await walkAround.flush();
      setLeaving(false);
      if (!saved) {
        toast.error("The walk-around was not saved. Your changes are still on screen. Press Retry.");
        return;
      }
    }
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitDetails = (values: DetailsValues) => {
    if (saveDetails.isPending) return;
    setServerErrors([]);
    saveDetails.mutate(detailsPayload(values), {
      onSuccess: () => {
        if (intent.current === "continue") {
          toast.success("Details saved");
          void go("WALK_AROUND");
        } else toast.success("Draft saved");
      },
      onError: (error) => {
        const details = isAxiosError(error) ? (error.response?.data as { details?: { field?: string }; errors?: { field?: string; message: string }[]; message?: string } | undefined) : undefined;
        const fields = [
          ...(details?.errors ?? []).map((item) => ({ field: detailsErrorField(item.field), message: item.message })),
          ...(details?.details?.field ? [{ field: detailsErrorField(details.details.field), message: details.message ?? "Check this field" }] : []),
        ].filter((item): item is { field: keyof DetailsValues; message: string } => !!item.field);
        if (fields.length) setServerErrors(fields);
        // Nothing typed is lost: the form keeps its values.
        toast.error(apiErrorMessage(error, "The details were not saved. Check your connection and try again."));
      },
    });
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const target = views[(index + delta + views.length) % views.length];
    void go(target.key);
    window.requestAnimationFrame(() => document.getElementById(`${tabsId}-${target.key}`)?.focus());
  };

  const barFor = () => {
    if (step === "DETAILS")
      return editable ? (
        <StageActionBar
          {...bar}
          onSaveDraft={() => {
            intent.current = "draft";
            (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
          }}
          savingDraft={saveDetails.isPending && intent.current === "draft"}
          next={{
            label: "Continue to walk-around",
            form: formId,
            onClick: () => {
              intent.current = "continue";
            },
            pending: saveDetails.isPending && intent.current === "continue",
            pendingLabel: "Saving details",
          }}
        />
      ) : (
        <StageActionBar {...bar} next={{ label: "Next: Walk-around", onClick: () => void go("WALK_AROUND") }} />
      );
    if (step === "WALK_AROUND")
      return (
        <StageActionBar
          {...bar}
          back={{ label: "Back to details", onClick: () => void go("DETAILS") }}
          next={{ label: editable ? "Continue to customer consent" : "Next: Customer consent", onClick: () => void go("CUSTOMER_CONSENT"), pending: leaving, pendingLabel: "Saving" }}
          status={editable ? <SaveIndicator state={walkAround.state} onRetry={() => void walkAround.flush()} onReload={() => void walkAround.reload()} /> : undefined}
        />
      );
    return (
      <StageActionBar
        {...bar}
        back={{ label: "Back to walk-around", onClick: () => void go("WALK_AROUND") }}
        note="The workshop supervisor will assign a technician and bay."
      />
    );
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Check-in steps" className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1">
        {views.map((view, index) => (
          <button
            key={view.key}
            id={`${tabsId}-${view.key}`}
            type="button"
            role="tab"
            aria-selected={view.current}
            aria-controls={`${tabsId}-panel`}
            aria-label={view.accessibleLabel}
            tabIndex={view.current ? 0 : -1}
            disabled={leaving}
            onClick={() => void go(view.key)}
            onKeyDown={(event) => onTabKey(event, index)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              view.current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                view.done
                  ? view.current
                    ? "border-primary-foreground bg-primary-foreground text-primary"
                    : "border-primary bg-primary text-primary-foreground"
                  : view.current
                    ? "border-primary-foreground"
                    : "border-border",
              )}
            >
              {view.done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className="truncate">{view.label}</span>
          </button>
        ))}
      </div>

      {!editable && checkIn.readOnlyReason && workspace.stage === "CHECK_IN" && !workspace.readOnly && (
        <p role="status" className="text-sm text-muted-foreground">
          {checkIn.readOnlyReason}
        </p>
      )}

      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${step}`}>
        {step === "DETAILS" && (
          <DetailsStep
            formId={formId}
            job={job}
            checkIn={checkIn}
            lastVisit={workspace.previousVisits[0] ?? null}
            editable={editable}
            onSubmit={submitDetails}
            serverErrors={serverErrors}
            onOpenTab={onOpenTab}
          />
        )}
        {step === "WALK_AROUND" && <WalkAroundStep checkIn={checkIn} draft={walkAround.draft} editable={editable} onChange={walkAround.update} />}
        {step === "CUSTOMER_CONSENT" && <ConsentStep jobCardId={job.id} checkIn={checkIn} editable={editable} onGoTo={(next) => void go(next)} />}
      </div>
      {barFor()}
    </div>
  );
}

/** "Saved 10:42" beside the walk-around, or what went wrong with a way to fix it. */
function SaveIndicator({ state, onRetry, onReload }: { state: SaveState; onRetry: () => void; onReload: () => void }) {
  const text = saveStateText(state);
  if (state.kind === "error" || state.kind === "conflict")
    return (
      <span role="alert" className="inline-flex flex-wrap items-center gap-2 text-sm text-destructive">
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        {text}
        <Button type="button" size="sm" variant="outline" onClick={state.kind === "conflict" ? onReload : onRetry}>
          <RefreshCw aria-hidden="true" />
          {state.kind === "conflict" ? "Load the latest" : "Retry"}
        </Button>
      </span>
    );
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      {state.kind === "saving" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : state.kind === "saved" ? <CircleCheck className="size-4" aria-hidden="true" /> : null}
      {text}
    </span>
  );
}
