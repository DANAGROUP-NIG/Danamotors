"use client";
import { ServiceTransactions } from "@/features/service-transactions/components/ServiceTransactions";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { Button } from "@/components/ui/button";
import { useJobCard } from "../hooks/use-job-card";
import { JobCardEstimateSection } from "./JobCardEstimateSection";
import { JobAdvanceSection } from "./JobAdvanceSection";
import { canonicalJobStatus, hasJobBill } from "../types/job-card-status";
import {
  JobProgressStepper,
  WorkspaceHeader,
  workspaceCardClass,
} from "./repair-workspace-ui";
import { WORKSPACE_COPY as COPY } from "./repair-workspace-copy";
import { cn } from "@/lib/utils";

export function RepairWorkspacePage({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const { data: jobCard, isLoading, error, refetch } = useJobCard(id);
  if (isLoading)
    return <LoadingSkeleton variant="workspace" label={COPY.loading} />;
  if (error || !jobCard)
    return (
      <div role="alert" className={cn(workspaceCardClass, "space-y-4 p-6")}>
        <p>{COPY.loadError}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          {COPY.retry}
        </Button>
      </div>
    );
  return (
    <section className={cn("min-w-0 text-foreground print:hidden", embedded ? "space-y-4" : "space-y-7 rounded-2xl border border-border bg-muted/40 p-4 sm:p-6")}>
      {!embedded && <WorkspaceHeader status={jobCard.status} />}
      {!embedded && <JobProgressStepper status={jobCard.status} />}
      <ServiceTransactions job={jobCard} embedded={embedded} />
      {(jobCard.advanceSummary || jobCard.advanceReceipts) && <JobAdvanceSection jobCard={jobCard} embedded={embedded} open={!hasJobBill(jobCard) && !['BILLED', 'DELIVERED', 'CANCELLED'].includes(canonicalJobStatus(jobCard.status))} />}
      {jobCard.estimates ? (
        <JobCardEstimateSection jobCard={jobCard} />
      ) : (
        <p
          className={cn(
            workspaceCardClass,
            "p-6 text-sm text-muted-foreground",
          )}
        >
          {COPY.noAccess}
        </p>
      )}
    </section>
  );
}
