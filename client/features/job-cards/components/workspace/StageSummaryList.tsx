"use client";
import type { ReactNode } from "react";
import { CircleCheck, ChevronDown, CircleMinus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DetailRow } from "../../lib/job-frame.logic";
import type { JobStep } from "../../lib/job-stage.logic";
import { DetailList } from "./StageCard";

export interface SummaryItem {
  stage: JobStep;
  line: string;
  skipped: boolean;
  details: DetailRow[];
}

/**
 * Finished steps as one line each. A line opens its read-only details, and `extra` adds a step's
 * own read-only view (the warranty check). A skipped step opens only when it has such a view.
 */
export function StageSummaryList({
  items,
  openStage,
  onToggle,
  extra,
}: {
  items: SummaryItem[];
  openStage: JobStep | null;
  onToggle: (stage: JobStep) => void;
  extra?: (stage: JobStep) => ReactNode;
}) {
  if (!items.length) return null;
  return (
    <section aria-label="Finished steps" className="divide-y divide-border rounded-xl border border-border bg-card">
      {items.map((item) => {
        const open = openStage === item.stage;
        const panelId = `summary-panel-${item.stage}`;
        const Icon = item.skipped ? CircleMinus : CircleCheck;
        const body = open ? extra?.(item.stage) : null;
        const opens = !item.skipped || !!extra?.(item.stage);
        return (
          <div key={item.stage} id={`summary-${item.stage}`} className="scroll-mt-40">
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
              aria-expanded={opens ? open : undefined}
              aria-controls={opens ? panelId : undefined}
              disabled={!opens}
              onClick={() => onToggle(item.stage)}
            >
              <Icon className={cn("size-4 shrink-0", item.skipped ? "text-muted-foreground" : "text-emerald-600")} aria-hidden="true" />
              <span className="min-w-0 flex-1">{item.line}</span>
              {opens && (
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
              )}
            </button>
            {open && opens && (
              <div id={panelId} className="space-y-3 border-t border-border bg-muted/40 px-4 py-3" role="region" aria-label={item.line}>
                <p className="text-xs text-muted-foreground">Read only</p>
                {item.details.length > 0 && <DetailList rows={item.details} />}
                {body}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
