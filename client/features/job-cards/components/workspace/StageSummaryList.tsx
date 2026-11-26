"use client";
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

/** Finished steps as one line each. A line opens its read-only details. */
export function StageSummaryList({
  items,
  openStage,
  onToggle,
}: {
  items: SummaryItem[];
  openStage: JobStep | null;
  onToggle: (stage: JobStep) => void;
}) {
  if (!items.length) return null;
  return (
    <section aria-label="Finished steps" className="divide-y divide-border rounded-xl border border-border bg-card">
      {items.map((item) => {
        const open = openStage === item.stage;
        const panelId = `summary-panel-${item.stage}`;
        const Icon = item.skipped ? CircleMinus : CircleCheck;
        return (
          <div key={item.stage} id={`summary-${item.stage}`} className="scroll-mt-40">
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
              aria-expanded={item.skipped ? undefined : open}
              aria-controls={item.skipped ? undefined : panelId}
              disabled={item.skipped}
              onClick={() => onToggle(item.stage)}
            >
              <Icon className={cn("size-4 shrink-0", item.skipped ? "text-muted-foreground" : "text-emerald-600")} aria-hidden="true" />
              <span className="min-w-0 flex-1">{item.line}</span>
              {!item.skipped && (
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
              )}
            </button>
            {open && !item.skipped && (
              <div id={panelId} className="border-t border-border bg-muted/40 px-4 py-3" role="region" aria-label={item.line}>
                <p className="mb-2 text-xs text-muted-foreground">Read only</p>
                <DetailList rows={item.details} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
