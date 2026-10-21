"use client";
import { ServiceTransactions } from "@/features/service-transactions/components/ServiceTransactions";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { Button } from "@/components/ui/button";
import { useJobCard } from "../hooks/use-job-card";
import { JobCardEstimateSection } from "./JobCardEstimateSection";
import { JobProgressStepper, WorkspaceHeader, workspaceCardClass } from "./repair-workspace-ui";
import { WORKSPACE_COPY as COPY } from "./repair-workspace-copy";
import { cn } from "@/lib/utils";

export function RepairWorkspacePage({ id }: { id: string }) {
  const { data: jobCard, isLoading, error, refetch } = useJobCard(id);
  if (isLoading) return <LoadingSkeleton variant="workspace" label={COPY.loading} />;
  if (error || !jobCard) return <div role="alert" className={cn(workspaceCardClass, "space-y-4 p-6")}><p>{COPY.loadError}</p><Button variant="outline" onClick={() => void refetch()}>{COPY.retry}</Button></div>;
  return <section className="min-w-0 space-y-7 rounded-2xl border border-border bg-muted/40 p-4 text-foreground sm:p-6 print:hidden">
    <WorkspaceHeader status={jobCard.status} />
    <JobProgressStepper status={jobCard.status} />
    <ServiceTransactions job={jobCard} />
    {jobCard.estimates ? <JobCardEstimateSection jobCard={jobCard} /> : <p className={cn(workspaceCardClass, "p-6 text-sm text-muted-foreground")}>{COPY.noAccess}</p>}
  </section>;
}
