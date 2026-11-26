"use client";
import { useId, useState } from "react";
import { Check, ChevronDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepView } from "../../lib/job-frame.logic";
import type { JobStep } from "../../lib/job-stage.logic";

/**
 * The 8 steps. Finished steps are buttons that open their read-only summary. On phones the
 * list folds into "Step N of 8: Label" with a progress bar and opens on tap.
 */
export function JobStepper({
  steps,
  phoneLabel,
  progress,
  cancelled,
  onOpenSummary,
}: {
  steps: StepView[];
  phoneLabel: string;
  progress: number;
  cancelled: boolean;
  onOpenSummary: (stage: JobStep) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  return (
    <nav aria-label="Job steps" className={cn("rounded-xl border border-border bg-card p-3 sm:p-4", cancelled && "opacity-60 grayscale")}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-md text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{phoneLabel}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
      </button>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted md:hidden"
        role="progressbar"
        aria-label="Steps finished"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
      </div>
      <ol id={listId} className={cn("mt-3 gap-2 md:mt-0 md:grid md:grid-cols-8", expanded ? "grid" : "hidden")}>
        {steps.map((step) => (
          <li
            key={step.stage}
            aria-current={step.state === "current" ? "step" : undefined}
            className="relative min-w-0 md:text-center"
          >
            <StepBody step={step} cancelled={cancelled} onOpenSummary={onOpenSummary} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

const STATE_TEXT = { completed: "completed", current: "current step", upcoming: "not started", skipped: "skipped" } as const;

function StepBody({ step, cancelled, onOpenSummary }: { step: StepView; cancelled: boolean; onOpenSummary: (stage: JobStep) => void }) {
  const circle = (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold tabular-nums",
        step.state === "completed" && "border-primary bg-primary text-primary-foreground",
        step.state === "current" && !cancelled && "border-2 border-primary bg-card text-primary",
        (step.state === "upcoming" || (step.state === "current" && cancelled)) && "border-border bg-card text-muted-foreground",
        step.state === "skipped" && "border-dashed border-border bg-muted text-muted-foreground",
      )}
      aria-hidden="true"
    >
      {step.state === "completed" ? <Check className="size-4" /> : step.state === "skipped" ? <Minus className="size-4" /> : step.number}
    </span>
  );
  const text = (
    // max-w-full keeps a long caption inside its column (truncated, with the full text as its tooltip).
    <span className="min-w-0 max-w-full">
      <span
        className={cn(
          "block text-sm",
          step.state === "current" && !cancelled ? "font-semibold text-foreground" : "text-muted-foreground",
          step.state === "completed" && "text-foreground",
        )}
      >
        {step.label}
        <span className="sr-only">, {STATE_TEXT[step.state]}</span>
      </span>
      {step.caption && <span className="block truncate text-xs text-muted-foreground" title={step.caption}>{step.caption}</span>}
    </span>
  );
  const layout = "flex w-full items-center gap-3 rounded-lg p-1.5 text-left md:flex-col md:gap-1.5 md:text-center";
  if (step.opensSummary)
    return (
      <button
        type="button"
        className={cn(layout, "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
        onClick={() => onOpenSummary(step.stage)}
        title={`Open the ${step.label} summary`}
      >
        {circle}
        {text}
      </button>
    );
  return (
    <div className={layout} tabIndex={step.state === "current" ? 0 : undefined}>
      {circle}
      {text}
    </div>
  );
}
