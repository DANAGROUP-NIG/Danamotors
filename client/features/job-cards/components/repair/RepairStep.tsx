"use client";
import { Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useJobRepair } from "../../hooks/use-job-repair";
import type { JobFileTab } from "../../lib/job-frame.logic";
import type { JobCard } from "../../types/job-card.types";
import type { JobWorkspace } from "../../types/job-workspace.types";
import type { StageBarProps } from "../check-in/CheckInStep";
import { StageActionBar } from "../workspace/StageActionBar";
import { StageCard } from "../workspace/StageCard";
import { RepairMonitor } from "./RepairMonitor";
import { TechnicianRepair } from "./TechnicianRepair";

const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status;

/**
 * Step 5: Repair. The technician (and the workshop supervisor standing in) works the phone view; the
 * service advisor and everyone else follow progress on the monitoring view, where the advisor also
 * handles the supplementary estimate.
 */
export function RepairStep({ job, workspace, bar, onOpenTab }: { job: JobCard; workspace: JobWorkspace; bar: StageBarProps; onOpenTab: (tab: JobFileTab) => void }) {
  const { isTechnician, isWorkshopManager } = useAuth();
  const query = useJobRepair(job.id);
  const quiet = { ...bar, primary: null, secondary: [] };
  if (query.isLoading)
    return (
      <>
        <LoadingSkeleton label="Loading the repair step" />
        <StageActionBar {...quiet} />
      </>
    );
  if (statusOf(query.error) === 403)
    return (
      <>
        <StageCard title="Repair">
          <p className="flex items-start gap-2 text-sm">
            <ShieldOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>You do not have access to this job&apos;s repair. The assigned technician, the workshop supervisor and the service advisor can open it.</span>
          </p>
        </StageCard>
        <StageActionBar {...bar} />
      </>
    );
  if (query.isError || !query.data)
    return (
      <>
        <StageCard title="Repair">
          <p role="alert" className="text-sm">
            The repair step could not be loaded. Check your connection and try again.
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
  // Technicians and workshop supervisors work the list; a supervisor who is not on the job still sees it read only.
  const workshopRole = isTechnician || isWorkshopManager;
  if (workshopRole && (step.access.canWork || isTechnician))
    return <TechnicianRepair job={job} step={step} bar={bar} readOnly={workspace.readOnly || !step.access.canWork} onOpenTab={onOpenTab} />;
  return <RepairMonitor job={job} step={step} bar={bar} onOpenTab={onOpenTab} />;
}
