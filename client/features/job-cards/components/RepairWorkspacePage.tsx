"use client";
import { Button } from "@/components/ui/button";
import { useJobCard } from "../hooks/use-job-card";
import { JobCardEstimateSection } from "./JobCardEstimateSection";
import { JobProgressStepper, WorkspaceHeader, workspaceCardClass } from "./repair-workspace-ui";
import { WORKSPACE_COPY as COPY } from "./repair-workspace-copy";
import { cn } from "@/lib/utils";

export function RepairWorkspacePage({ id }: { id: string }) {
  const { data: jobCard, isLoading, error, refetch } = useJobCard(id);
  if (isLoading) return <div aria-busy="true" aria-label={COPY.loading} className="min-w-0 space-y-7 print:hidden"><div className="h-20 animate-pulse rounded-xl bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /><div className="h-20 animate-pulse rounded-xl bg-muted" /><div className={cn(workspaceCardClass, "space-y-8 p-6")}><div className="h-8 w-2/3 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded bg-muted" /><div className="h-72 animate-pulse rounded bg-muted" /><div className="h-12 w-2/3 animate-pulse rounded bg-muted" /></div></div>;
  if (error || !jobCard) return <div role="alert" className={cn(workspaceCardClass, "space-y-4 p-6")}><p>{COPY.loadError}</p><Button variant="outline" onClick={() => void refetch()}>{COPY.retry}</Button></div>;
  return <section className="min-w-0 space-y-7 rounded-2xl border border-border bg-muted/40 p-4 text-foreground sm:p-6 print:hidden">
    <WorkspaceHeader status={jobCard.status} />
    <JobProgressStepper status={jobCard.status} />
    {jobCard.estimates ? <JobCardEstimateSection jobCard={jobCard} /> : <p className={cn(workspaceCardClass, "p-6 text-sm text-muted-foreground")}>{COPY.noAccess}</p>}
  </section>;
}
