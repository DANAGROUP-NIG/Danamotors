import Link from "next/link";
import { CircleAlert, FileQuestion, Loader2, Lock, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { NOT_PROVIDED, formatDateTime } from "@/lib/format";
import type { LoadProblem } from "../../lib/job-frame.logic";
import type { JobWorkspace } from "../../types/job-workspace.types";

/** Placeholder shaped like the job frame: header, 8 steps, two cards. No spinner. */
export function JobFrameSkeleton() {
  return (
    <LoadingRegion label="Loading job card" className="space-y-4 px-4 py-4 lg:px-5">
      <div className="space-y-3 border-b border-border pb-4">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-7 w-full max-w-md" />
          <Skeleton className="h-10 w-48" />
        </div>
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-4 w-40 md:hidden" />
        <div className="hidden grid-cols-8 gap-2 md:grid">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex flex-col items-center gap-2">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </LoadingRegion>
  );
}

const PROBLEM = {
  error: {
    icon: CircleAlert,
    body: "Check your connection and try again.",
  },
  "not-found": {
    icon: FileQuestion,
    title: "Job card not found",
    body: "The link may be wrong, or the job card was removed. Find the job on the Job cards list.",
  },
  denied: {
    icon: Lock,
    title: "You cannot open this job card",
    body: "This job card belongs to another branch. Only staff who work at that branch, or staff with access to all branches, can open it. Ask your branch manager or an administrator if you need access.",
  },
} as const;

/** Load error with Try again, not found, or permission denied. */
export function JobLoadProblem({
  kind,
  jobNumber,
  retrying,
  onRetry,
}: {
  kind: LoadProblem;
  jobNumber?: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  const view = PROBLEM[kind];
  const Icon = view.icon;
  const title = kind === "error" ? (jobNumber ? `Could not load job ${jobNumber}` : "Could not load this job card") : PROBLEM[kind].title;
  return (
    <div className="px-4 py-10 lg:px-5">
      <section
        role={kind === "error" ? "alert" : "status"}
        className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-10 text-center"
      >
        <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{view.body}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {kind === "error" ? (
            <Button type="button" onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              {retrying ? "Trying again" : "Try again"}
            </Button>
          ) : null}
          <Button asChild variant={kind === "error" ? "outline" : "default"}>
            <Link href="/job-cards">Go to job cards</Link>
          </Button>
        </div>
        {kind === "error" && <p className="text-xs text-muted-foreground">If this keeps happening, contact your system administrator.</p>}
      </section>
    </div>
  );
}

/** Who cancelled the job, when and why, with a way to the full activity. */
export function CancelledPanel({
  cancellation,
  onViewActivity,
}: {
  cancellation: JobWorkspace["cancellation"];
  onViewActivity: () => void;
}) {
  return (
    <section aria-label="Cancelled job" className="flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
      <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <p className="font-semibold">
          Cancelled by {cancellation?.by ?? NOT_PROVIDED}, {formatDateTime(cancellation?.at)}.
        </p>
        <p className="whitespace-pre-wrap break-words">Reason: {cancellation?.reason?.trim() || NOT_PROVIDED}</p>
      </div>
      <button
        type="button"
        onClick={onViewActivity}
        className="text-sm font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        View activity
      </button>
    </section>
  );
}
