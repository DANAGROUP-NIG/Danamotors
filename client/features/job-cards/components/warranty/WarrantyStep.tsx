"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { useJobWarranty, useSaveWarrantyDecisions } from "../../hooks/use-job-warranty";
import { defaultCampaign, handoffNote } from "../../lib/warranty-check.logic";
import type { JobCard } from "../../types/job-card.types";
import type { DecisionItem, FindingPayer, JobWarrantyCheck, OutsideServiceRecord } from "../../types/job-warranty.types";
import type { StageAction } from "../../types/job-workspace.types";
import type { StageBarProps } from "../check-in/CheckInStep";
import { StageActionBar } from "../workspace/StageActionBar";
import { StageCard } from "../workspace/StageCard";
import { ItemsToDecide, type ItemSaveState, type ReasonControls } from "./ItemsToDecide";
import { OutsideServiceDialog, RemoveRecordDialog } from "./OutsideServiceDialog";
import { CampaignsCard, CoverageCard, ServiceHistoryCard } from "./WarrantyCards";

const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status;
const REASON_DELAY = 1200;

/** Shown to staff without warranty access, at the step or in its summary. */
export function WarrantyAccessDenied() {
  return (
    <StageCard title="Warranty check">
      <p className="flex items-start gap-2 text-sm">
        <ShieldOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          Only warranty staff can see the warranty evidence. The warranty officer checks the cover and service history, decides who pays for each item, and then returns the job to the
          service advisor for the estimate.
        </span>
      </p>
    </StageCard>
  );
}

function LoadProblem({ onRetry, fetching }: { onRetry: () => void; fetching: boolean }) {
  return (
    <StageCard title="Warranty check">
      <p role="alert" className="text-sm">
        The warranty check could not be loaded. Check your connection and try again.
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

/** The evidence and the items, read only: for a finished or skipped warranty step and for other staff. */
export function WarrantyEvidence({ jobCardId }: { jobCardId: string }) {
  const query = useJobWarranty(jobCardId);
  if (query.isLoading) return <LoadingSkeleton label="Loading the warranty check" />;
  if (statusOf(query.error) === 403) return <WarrantyAccessDenied />;
  if (query.isError || !query.data) return <LoadProblem onRetry={() => void query.refetch()} fetching={query.isFetching} />;
  return <WarrantyLayout check={query.data} editable={false} />;
}

/** The warranty officer's step: coverage, service history, campaigns, and who pays for each item. */
export function WarrantyStep({ job, bar }: { job: JobCard; bar: StageBarProps }) {
  const query = useJobWarranty(job.id);
  if (query.isLoading)
    return (
      <>
        <LoadingSkeleton label="Loading the warranty check" />
        <StageActionBar {...bar} primary={null} secondary={[]} />
      </>
    );
  if (statusOf(query.error) === 403)
    return (
      <>
        <WarrantyAccessDenied />
        <StageActionBar {...bar} />
      </>
    );
  if (query.isError || !query.data)
    return (
      <>
        <LoadProblem onRetry={() => void query.refetch()} fetching={query.isFetching} />
        <StageActionBar {...bar} />
      </>
    );
  const advisor = job.serviceAdvisor ? `${job.serviceAdvisor.firstName} ${job.serviceAdvisor.lastName}` : null;
  return <WarrantyLoaded check={query.data} bar={bar} advisor={advisor} />;
}

function WarrantyLoaded({ check, bar, advisor }: { check: JobWarrantyCheck; bar: StageBarProps; advisor: string | null }) {
  const save = useSaveWarrantyDecisions(check.jobCardId);
  const [chosen, setChosen] = useState<Record<string, { payer: FindingPayer; campaignId: string | null }>>({});
  const [saveState, setSaveState] = useState<Record<string, ItemSaveState | undefined>>({});
  const [reasonValue, setReasonValue] = useState(check.reason ?? "");
  const [reasonStatus, setReasonStatus] = useState<ReasonControls["status"]>("idle");
  const savedReason = useRef(check.reason ?? "");
  const reasonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flushing, setFlushing] = useState(false);
  const editable = check.editable;

  const payerOf = (item: DecisionItem) => chosen[item.id]?.payer ?? item.payer;
  const campaignOf = (item: DecisionItem) => chosen[item.id]?.campaignId ?? item.campaignId;

  const sendDecision = (item: DecisionItem, payer: FindingPayer, campaignId: string | null) => {
    setSaveState((current) => ({ ...current, [item.id]: { kind: "saving" } }));
    save.mutate(
      { items: [{ itemId: item.id, payer, ...(payer === "CAMPAIGN" && campaignId && { campaignId }) }] },
      {
        onSuccess: () => {
          setSaveState((current) => ({ ...current, [item.id]: undefined }));
          setChosen((current) => {
            const rest = { ...current };
            delete rest[item.id];
            return rest;
          });
        },
        // The choice stays on screen marked Not saved, with Retry.
        onError: (error) => {
          const message = apiErrorMessage(error, "Check your connection and try again.");
          setSaveState((current) => ({ ...current, [item.id]: { kind: "failed", message } }));
          toast.error(`${item.description}: not saved. ${message}`);
        },
      },
    );
  };

  const onDecide = (item: DecisionItem, payer: FindingPayer, campaignId?: string | null) => {
    const campaign = payer === "CAMPAIGN" ? (campaignId !== undefined ? campaignId : (campaignOf(item) ?? defaultCampaign(check.campaigns))) : null;
    setChosen((current) => ({ ...current, [item.id]: { payer, campaignId: campaign } }));
    // With more than one linked campaign, wait until the officer picks which one pays.
    if (payer === "CAMPAIGN" && !campaign && check.campaigns.length > 1) return;
    sendDecision(item, payer, campaign);
  };

  const saveReason = useCallback(
    async (value: string) => {
      if (value.trim() === savedReason.current.trim()) return true;
      setReasonStatus("saving");
      try {
        await save.mutateAsync({ items: [], reason: value.trim() || null });
        savedReason.current = value;
        setReasonStatus("saved");
        return true;
      } catch {
        setReasonStatus("failed");
        return false;
      }
    },
    [save],
  );

  const onReasonChange = (value: string) => {
    setReasonValue(value);
    setReasonStatus("idle");
    if (reasonTimer.current) clearTimeout(reasonTimer.current);
    reasonTimer.current = setTimeout(() => void saveReason(value), REASON_DELAY);
  };
  useEffect(() => () => {
    if (reasonTimer.current) clearTimeout(reasonTimer.current);
  }, []);

  /** The reason and any unsaved choice are saved before the job goes back to the advisor. */
  const onAction = async (action: StageAction) => {
    if (action !== "WARRANTY_TO_ADVISOR") {
      bar.onAction(action);
      return;
    }
    if (reasonTimer.current) clearTimeout(reasonTimer.current);
    setFlushing(true);
    const reasonSaved = await saveReason(reasonValue);
    setFlushing(false);
    if (!reasonSaved || Object.values(saveState).some((state) => state?.kind === "failed")) {
      toast.error("Some decisions are not saved. Press Retry on the item marked Not saved, then return the job again.");
      return;
    }
    bar.onAction(action);
  };

  const busy = flushing || save.isPending;
  return (
    <>
      <WarrantyLayout
        check={check}
        editable={editable}
        controls={{
          payerOf,
          campaignOf,
          saveState,
          onDecide,
          onRetry: (item) => {
            const choice = chosen[item.id];
            if (choice) sendDecision(item, choice.payer, choice.campaignId);
          },
        }}
        reason={
          editable
            ? {
                value: reasonValue,
                onChange: onReasonChange,
                onBlur: () => {
                  if (reasonTimer.current) clearTimeout(reasonTimer.current);
                  void saveReason(reasonValue);
                },
                status: reasonStatus,
                onRetry: () => void saveReason(reasonValue),
              }
            : null
        }
      />
      <StageActionBar
        {...bar}
        pending={busy && bar.primary?.action === "WARRANTY_TO_ADVISOR" ? "WARRANTY_TO_ADVISOR" : bar.pending}
        onAction={(action) => void onAction(action)}
        note={editable ? handoffNote(advisor) : undefined}
      />
    </>
  );
}

/** Coverage and campaigns beside the service history on wide screens; the items below, full width. */
function WarrantyLayout({
  check,
  editable,
  controls,
  reason = null,
}: {
  check: JobWarrantyCheck;
  editable: boolean;
  controls?: Parameters<typeof ItemsToDecide>[0]["controls"];
  reason?: ReasonControls | null;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<OutsideServiceRecord | null>(null);
  const readOnlyControls = {
    payerOf: (item: DecisionItem) => item.payer,
    campaignOf: (item: DecisionItem) => item.campaignId,
    saveState: {},
    onDecide: () => undefined,
    onRetry: () => undefined,
  };
  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:items-start">
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1">
          <CoverageCard check={check} />
          <CampaignsCard check={check} />
        </div>
        <ServiceHistoryCard
          check={check}
          onAddRecord={check.canAddRecords ? () => setAdding(true) : undefined}
          onRemoveRecord={check.canAddRecords ? setRemoving : undefined}
        />
      </div>
      <ItemsToDecide check={check} editable={editable} controls={controls ?? readOnlyControls} reason={reason} />
      {check.canAddRecords && (
        <>
          <OutsideServiceDialog jobCardId={check.jobCardId} saleDate={check.vehicle.saleDate} open={adding} onClose={() => setAdding(false)} />
          <RemoveRecordDialog jobCardId={check.jobCardId} record={removing} onClose={() => setRemoving(null)} />
        </>
      )}
    </div>
  );
}
