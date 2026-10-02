import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime, personName } from "../lib/indent-status";
import type { ProgressStep } from "../types/indent.types";

/** Horizontal stepper built from the indent's status history. */
export function IndentProgress({ steps, stopped }: { steps: ProgressStep[]; stopped?: string | null }) {
  const current = steps.findIndex((s) => !s.completed);
  return (
    <ol className="grid gap-4 sm:grid-cols-4 lg:grid-cols-8">
      {steps.map((step, index) => {
        const isCurrent = index === current && !stopped;
        return (
          <li key={step.key} className="relative flex gap-3 sm:flex-col sm:gap-2">
            {index < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-3.5 top-8 h-[calc(100%-1rem)] w-px sm:left-8 sm:top-3.5 sm:h-px sm:w-[calc(100%-1.5rem)]",
                  step.completed ? "bg-primary" : "bg-slate-200",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                step.completed && "border-primary bg-primary text-primary-foreground",
                isCurrent && "border-primary bg-white text-primary",
                !step.completed && !isCurrent && "border-slate-200 bg-white text-slate-400",
              )}
            >
              {step.completed ? <Check className="size-3.5" /> : index + 1}
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm font-semibold", step.completed || isCurrent ? "text-slate-800" : "text-slate-400")}>
                {step.label}
              </p>
              {step.completed && (
                <p className="text-[11px] leading-tight text-slate-400">
                  {fmtDateTime(step.at)}
                  <br />
                  {personName(step.by)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
