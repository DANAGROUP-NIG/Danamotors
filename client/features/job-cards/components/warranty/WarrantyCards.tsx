"use client";
import { useState } from "react";
import { CircleAlert, CircleCheck, CircleDashed, Info, Megaphone, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CAMPAIGN_TYPE_LABELS } from "@/features/warranty/lib/warranty-format";
import {
  coverageView,
  PERIOD_STATUS,
  periodAria,
  periodLabel,
  periodLines,
  recordLine,
  ruleSentence,
  verdictBadge,
  yearHeading,
} from "../../lib/warranty-check.logic";
import type { JobWarrantyCheck, OutsideServiceRecord, PeriodRow, YearRow } from "../../types/job-warranty.types";
import { PhotoThumb } from "../check-in/PhotoSlots";
import { StageCard } from "../workspace/StageCard";

/** A labelled bar with its percentage, for time and distance used. */
function UsageBar({ label, percent }: { label: string; percent: number }) {
  const value = Math.max(0, Math.min(100, percent));
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label={label}
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <div className={cn("h-full rounded-full", value >= 100 ? "bg-red-600" : "bg-emerald-600")} style={{ width: `${value}%` }} />
        </div>
        <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{value}%</span>
      </div>
    </div>
  );
}

/** Coverage at the job's opening: sold and expiry dates, time and distance used. */
export function CoverageCard({ check }: { check: JobWarrantyCheck }) {
  const view = coverageView(check.coverage, check.history?.asOf ?? null);
  return (
    <StageCard title="Coverage" actions={<StatusBadge status={view.badge.label} tone={view.badge.tone} className="text-xs normal-case" />}>
      <p className="text-sm">{view.soldLine}</p>
      {view.time || view.distance ? (
        <div className="grid gap-4 border-t border-border pt-4">
          {view.time && <UsageBar label={view.time.label} percent={view.time.percent} />}
          {view.distance && <UsageBar label={view.distance.label} percent={view.distance.percent} />}
        </div>
      ) : null}
      {check.coverage.reasonText.length > 0 && (
        <ul className="grid gap-1 text-sm text-muted-foreground">
          {check.coverage.reasonText.map((reason) => (
            <li key={reason} className="flex gap-2">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {reason}.
            </li>
          ))}
        </ul>
      )}
    </StageCard>
  );
}

function PeriodBlock({ row, perYear, year }: { row: PeriodRow; perYear: number; year: number }) {
  const status = PERIOD_STATUS[row.status];
  const lines = periodLines(row);
  return (
    <div
      role="group"
      aria-label={periodAria(year, row, perYear)}
      className={cn(
        "grid min-w-0 content-start gap-1 rounded-lg border p-2.5 text-sm",
        row.status === "MISSED" ? "border-red-200 bg-red-50" : "border-border bg-card",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground xl:hidden">{periodLabel(row.period, perYear)}</span>
        <StatusBadge status={status.label} tone={status.tone} className="px-2 text-xs normal-case" />
      </div>
      {lines.date && <span className="font-medium tabular-nums">{lines.date}</span>}
      {lines.detail && <span className={cn("text-xs", row.status === "MISSED" ? "text-red-800" : "text-muted-foreground")}>{lines.detail}</span>}
    </div>
  );
}

function YearIcon({ year }: { year: YearRow }) {
  if (year.missedCount > 0) return <CircleAlert className="size-5 shrink-0 text-amber-600" aria-hidden="true" />;
  if (year.current) return <CircleDashed className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />;
  return <CircleCheck className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />;
}

/**
 * The service history rule: each warranty year from the sale date, split into quarters, each
 * marked On time, Missed, Upcoming or No service due in words as well as colour.
 */
export function ServiceHistoryCard({
  check,
  onAddRecord,
  onRemoveRecord,
}: {
  check: JobWarrantyCheck;
  onAddRecord?: () => void;
  onRemoveRecord?: (record: OutsideServiceRecord) => void;
}) {
  const history = check.history;
  const badge = history ? verdictBadge(history.verdict) : { label: "Cannot check", tone: "gray" as const };
  const perYear = history?.rule.servicesPerYear ?? 4;
  return (
    <StageCard
      title="Service history"
      description={history ? ruleSentence(history.rule) : undefined}
      actions={<StatusBadge status={badge.label} tone={badge.tone} className="text-xs normal-case" />}
    >
      {history && <p className="text-sm font-medium">{history.sentence}</p>}

      {history?.insufficient.length ? (
        <div role="note" className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {history.insufficient.map((row) => (
            <p key={row.reason} className="flex gap-2">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {row.text}. {row.fix}
              </span>
            </p>
          ))}
        </div>
      ) : null}

      {history && history.years.length > 0 && (
        <div className="grid gap-2">
          <div className="hidden grid-cols-[11rem_repeat(4,minmax(0,1fr))] gap-2 px-1 text-xs font-semibold text-muted-foreground xl:grid" aria-hidden="true">
            <span />
            {history.years[0].periods.map((row) => (
              <span key={row.period}>{periodLabel(row.period, perYear)}</span>
            ))}
          </div>
          <ol className="grid gap-3" aria-label="Warranty years">
            {history.years.map((year) => {
              const heading = yearHeading(year);
              return (
                <li key={year.year} className="grid gap-2 xl:grid-cols-[11rem_minmax(0,1fr)] xl:items-start">
                  <div className="flex items-start gap-2">
                    <YearIcon year={year} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{heading.title}</p>
                      <p className="text-xs text-muted-foreground">{heading.range}</p>
                      {year.missedCount > 0 && (
                        <p className="text-xs font-medium text-amber-800">{year.missedCount === 1 ? "1 missed" : `${year.missedCount} missed`}</p>
                      )}
                    </div>
                  </div>
                  <div className={cn("grid gap-2 sm:grid-cols-2", perYear === 4 ? "md:grid-cols-4" : perYear > 4 ? "md:grid-cols-6" : "md:grid-cols-2")}>
                    {year.periods.map((row) => (
                      <PeriodBlock key={row.period} row={row} perYear={perYear} year={year.year} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <OutsideRecords records={check.outsideRecords} onRemove={onRemoveRecord} />

      {onAddRecord && (
        <div>
          <Button type="button" variant="outline" onClick={onAddRecord}>
            <Plus aria-hidden="true" />
            Add outside service record
          </Button>
        </div>
      )}
    </StageCard>
  );
}

/** Services at other authorised dealers, each with its stamped service book photo. */
function OutsideRecords({ records, onRemove }: { records: OutsideServiceRecord[]; onRemove?: (record: OutsideServiceRecord) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!records.length) return null;
  return (
    <div className="grid gap-2 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Outside service records</h3>
      <ul className="grid gap-2">
        {records.map((record) => (
          <li key={record.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-2.5 text-sm">
            {record.photo ? (
              <button
                type="button"
                className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setOpen(open === record.id ? null : record.id)}
                aria-expanded={open === record.id}
                aria-label={`Service book photo for ${recordLine(record)}`}
              >
                <PhotoThumb jobCardId={record.photo.jobCardId} photoId={record.photo.id} alt="Stamped service book page" className="size-12 rounded" />
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="font-medium tabular-nums">{recordLine(record)}</p>
              <p className="text-xs text-muted-foreground">
                Added by {record.addedBy ?? "a warranty officer"}, {formatDate(record.createdAt)}
                {record.note ? `. ${record.note}` : ""}
              </p>
            </div>
            {onRemove && record.canRemove && (
              <Button type="button" variant="outline" size="sm" onClick={() => onRemove(record)} aria-label={`Remove the record of ${recordLine(record)}`} title="Remove record">
                <Trash2 aria-hidden="true" />
                <span className="hidden sm:inline">Remove</span>
              </Button>
            )}
            {open === record.id && record.photo && (
              <PhotoThumb jobCardId={record.photo.jobCardId} photoId={record.photo.id} alt="Stamped service book page, full size" className="w-full max-w-md rounded-lg object-contain" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Campaigns and recalls linked to this job when it opened. */
export function CampaignsCard({ check }: { check: JobWarrantyCheck }) {
  return (
    <StageCard title="Campaigns and recalls">
      {check.campaigns.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
          <Megaphone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          No open campaigns for this vehicle.
        </p>
      ) : (
        <ul className="grid gap-2">
          {check.campaigns.map((campaign) => (
            <li key={campaign.id} className="grid gap-1 rounded-lg border border-border p-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{campaign.code}</span>
                <StatusBadge status={CAMPAIGN_TYPE_LABELS[campaign.type]} tone="amber" className="px-2 text-xs normal-case" />
              </div>
              <p>{campaign.title}</p>
              <p className="text-xs text-muted-foreground">Choose Campaign for the items this campaign pays for.</p>
            </li>
          ))}
        </ul>
      )}
    </StageCard>
  );
}

