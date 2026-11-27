"use client";
import { History } from "lucide-react";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { QC_RESULT_BADGE, roadTestText } from "../../lib/quality-check.logic";
import type { QcInspection } from "../../types/job-quality-check.types";
import { StageCard } from "../workspace/StageCard";

/** Every quality check on the job, newest first: a second check after a fail shows both. */
export function QcHistory({ history, title = "Earlier checks" }: { history: QcInspection[]; title?: string }) {
  if (!history.length) return null;
  return (
    <StageCard title={title} description="Each quality check on this job, newest first.">
      <ol className="space-y-3">
        {history.map((row) => {
          const badge = QC_RESULT_BADGE[row.result];
          const road = roadTestText(row.roadTest);
          return (
            <li key={row.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <History className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <StatusBadge status={badge.label} tone={badge.tone} className="text-xs normal-case" />
                <span className="font-medium">
                  {row.inspector ?? "Workshop supervisor"}, {formatDateTime(row.at)}
                </span>
                {row.current && <StatusBadge status="Current result" tone="blue" className="text-xs normal-case" />}
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                {row.failedLines.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">Failed work</dt>
                    <dd className="break-words">{row.failedLines.join(", ")}</dd>
                  </>
                )}
                {row.notes && (
                  <>
                    <dt className="text-muted-foreground">Note</dt>
                    <dd className="whitespace-pre-wrap break-words">{row.notes}</dd>
                  </>
                )}
                {road && (
                  <>
                    <dt className="text-muted-foreground">Road test</dt>
                    <dd className="tabular-nums">{road}</dd>
                  </>
                )}
                {row.roadTest?.notes && (
                  <>
                    <dt className="text-muted-foreground">Road test notes</dt>
                    <dd className="whitespace-pre-wrap break-words">{row.roadTest.notes}</dd>
                  </>
                )}
                {row.acOutletTempC && (
                  <>
                    <dt className="text-muted-foreground">AC outlet temperature</dt>
                    <dd className="tabular-nums">{row.acOutletTempC} °C</dd>
                  </>
                )}
                {row.certified && (
                  <>
                    <dt className="text-muted-foreground">Certified roadworthy</dt>
                    <dd>
                      {row.certified.by ?? "Workshop supervisor"}, {formatDateTime(row.certified.at)}
                      {row.certified.signed ? ", signed" : ""}
                    </dd>
                  </>
                )}
              </dl>
            </li>
          );
        })}
      </ol>
    </StageCard>
  );
}
