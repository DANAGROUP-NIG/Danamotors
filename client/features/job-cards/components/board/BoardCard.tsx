"use client";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Clock } from "lucide-react";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { RepeatTag } from "@/features/repeat-jobs/components/repeat-ui";
import { NOT_PROVIDED } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  cardAccessibleName,
  durationText,
  initials,
  isOverdue,
  minutesSince,
  ownerName,
  promisedText,
  timingStateText,
  timingTone,
} from "../../lib/board.logic";
import type {
  BoardCard as BoardCardData,
  BoardColumnKey,
} from "../../types/job-board.types";

const TIMING_STYLES = {
  normal: "bg-muted text-foreground",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
} as const;

/**
 * One job on the board: plate, model, customer, who holds it, time in the step (with words, not colour alone)
 * and the promised time. The whole card is one link to the job card.
 */
export function BoardCard({
  card,
  column,
  targetMinutes,
  now,
}: {
  card: BoardCardData;
  column: BoardColumnKey;
  targetMinutes: number | null;
  now: Date;
}) {
  const minutes = minutesSince(card.enteredAt, now);
  const tone = timingTone(minutes, targetMinutes);
  const state = timingStateText(tone, targetMinutes);
  const overdue = isOverdue(column, card.promisedAt, now);
  const owner = ownerName(card.owner);
  const label = [
    cardAccessibleName(card, column, minutes, state),
    promisedText(card.promisedAt, now),
    overdue ? "promised time passed" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={`/job-cards/${card.id}`}
      aria-label={label}
      className="block rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/60 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="min-w-0 truncate text-base font-bold tabular-nums"
          title={card.plate ?? undefined}
        >
          {card.plate ?? NOT_PROVIDED}
        </p>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {card.jobNumber}
        </span>
      </div>
      <p
        className="truncate text-muted-foreground"
        title={card.model ?? undefined}
      >
        {card.model ?? "Model not provided"}
      </p>
      <p className="truncate" title={card.customer ?? undefined}>
        {card.customer ?? "Customer not provided"}
      </p>
      {(card.warranty || (card.repeat && card.repeat !== "NOT_REPEAT")) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.warranty && (
            <StatusBadge
              status="Warranty"
              tone="purple"
              className="px-2 py-0 text-xs normal-case"
            />
          )}
          {card.repeat && card.repeat !== "NOT_REPEAT" && (
            <RepeatTag status={card.repeat} />
          )}
        </div>
      )}
      <p className="mt-2 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-semibold"
        >
          {initials(card.owner?.name ?? owner)}
        </span>
        <span className="min-w-0 truncate">With: {owner}</span>
      </p>
      <p
        className={cn(
          "mt-2 flex items-start gap-1.5 rounded-md px-2 py-1 font-semibold tabular-nums",
          TIMING_STYLES[tone],
        )}
      >
        <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          {durationText(minutes)}
          {state && tone !== "normal" && (
            <span className="font-medium">, {state.toLowerCase()}</span>
          )}
        </span>
      </p>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <CalendarClock
          className="mt-0.5 size-3.5 shrink-0"
          aria-hidden="true"
        />
        <span>{promisedText(card.promisedAt, now)}</span>
      </p>
      {overdue && (
        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-red-700">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          Promised time passed
        </p>
      )}
    </Link>
  );
}
