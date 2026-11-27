"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  ClipboardList,
  Package,
  Plus,
  RefreshCw,
  ShieldOff,
  TableProperties,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { cn } from "@/lib/utils";
import {
  BOARD_COLUMNS,
  BOARD_COLUMN_KEYS,
  BOARD_EMPTY_COLUMN,
  cappedText,
  targetText,
} from "../../lib/board.logic";
import type {
  BoardColumnData,
  BoardColumnKey,
  BoardSummary,
} from "../../types/job-board.types";
import { BoardCard } from "./BoardCard";

/** The five figures above the board. Overdue turns red only when there is something overdue. */
export function BoardFigures({ summary }: { summary: BoardSummary }) {
  const figures: {
    label: string;
    value: number;
    icon: ReactNode;
    alert?: boolean;
  }[] = [
    {
      label: "In workshop",
      value: summary.inWorkshop,
      icon: <Car className="size-5" aria-hidden="true" />,
    },
    {
      label: "Awaiting approval",
      value: summary.awaitingApproval,
      icon: <ClipboardList className="size-5" aria-hidden="true" />,
    },
    {
      label: "Waiting parts",
      value: summary.waitingParts,
      icon: <Package className="size-5" aria-hidden="true" />,
    },
    {
      label: "Ready for collection",
      value: summary.readyForCollection,
      icon: <CheckCircle2 className="size-5" aria-hidden="true" />,
    },
    {
      label: "Overdue",
      value: summary.overdue,
      icon: <AlertTriangle className="size-5" aria-hidden="true" />,
      alert: summary.overdue > 0,
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {figures.map((figure) => (
        <div
          key={figure.label}
          className={cn(
            "flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3",
            figure.alert && "border-red-200 bg-red-50 text-red-700",
            figure.label === "Overdue" && "col-span-2 sm:col-span-1",
          )}
        >
          <span
            className={cn(
              "shrink-0 text-muted-foreground",
              figure.alert && "text-red-700",
            )}
          >
            {figure.icon}
          </span>
          <div className="flex min-w-0 flex-col-reverse">
            <dt className="text-sm leading-tight">{figure.label}</dt>
            <dd className="text-2xl font-bold tabular-nums leading-tight">
              {figure.value}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

function ColumnHeading({
  column,
  id,
}: {
  column: BoardColumnData;
  id: string;
}) {
  const meta = BOARD_COLUMNS[column.key];
  const target = targetText(column.targetMinutes);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="flex items-center gap-2">
        <StatusBadge
          status={meta.label}
          tone={meta.tone}
          className="text-sm normal-case"
        />
        <span
          className="text-sm font-semibold tabular-nums"
          aria-label={`${column.total} ${column.total === 1 ? "job" : "jobs"}`}
        >
          {column.total}
        </span>
      </h2>
      {target && (
        <span className="text-xs text-muted-foreground">{target}</span>
      )}
    </div>
  );
}

function ColumnCards({
  column,
  now,
  tableHref,
}: {
  column: BoardColumnData;
  now: Date;
  tableHref: (key: BoardColumnKey) => string;
}) {
  const capped = cappedText(column.cards.length, column.total);
  return (
    <>
      {column.cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          {BOARD_EMPTY_COLUMN}
        </p>
      ) : (
        <ul className="grid gap-2">
          {column.cards.map((card) => (
            <li key={card.id}>
              <BoardCard
                card={card}
                column={column.key}
                targetMinutes={column.targetMinutes}
                now={now}
              />
            </li>
          ))}
        </ul>
      )}
      {capped && (
        <p className="text-sm text-muted-foreground">
          {capped}{" "}
          <Link
            href={tableHref(column.key)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Show all in table
          </Link>
        </p>
      )}
    </>
  );
}

/** Tablet and desktop: one column per step, scrolling sideways inside the board only. */
export function BoardColumns({
  columns,
  now,
  tableHref,
}: {
  columns: BoardColumnData[];
  now: Date;
  tableHref: (key: BoardColumnKey) => string;
}) {
  return (
    <div
      role="region"
      aria-label="Workshop board columns. Scroll sideways to see every step."
      tabIndex={0}
      className="hidden min-w-0 overflow-x-auto rounded-xl pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:block"
    >
      <div className="flex min-w-max gap-3">
        {columns.map((column) => (
          <section
            key={column.key}
            aria-labelledby={`board-column-${column.key}`}
            className="flex w-64 shrink-0 flex-col gap-2 rounded-xl border border-border bg-muted/30 p-2 xl:w-60"
          >
            <ColumnHeading column={column} id={`board-column-${column.key}`} />
            <ColumnCards column={column} now={now} tableHref={tableHref} />
          </section>
        ))}
      </div>
    </div>
  );
}

/** Phone: a step selector with the count of each step, then that step's cards as a list. */
export function BoardPhoneList({
  columns,
  selected,
  onSelect,
  now,
  tableHref,
}: {
  columns: BoardColumnData[];
  selected: BoardColumnKey;
  onSelect: (key: BoardColumnKey) => void;
  now: Date;
  tableHref: (key: BoardColumnKey) => string;
}) {
  const column = columns.find((item) => item.key === selected) ?? columns[0];
  if (!column) return null;
  return (
    <div className="grid gap-3 md:hidden">
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold">Step</span>
        <select
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          value={column.key}
          onChange={(event) => onSelect(event.target.value as BoardColumnKey)}
        >
          {columns.map((item) => (
            <option key={item.key} value={item.key}>
              {BOARD_COLUMNS[item.key].label} ({item.total})
            </option>
          ))}
        </select>
      </label>
      <section aria-labelledby="board-phone-column" className="grid gap-2">
        <ColumnHeading column={column} id="board-phone-column" />
        <ColumnCards column={column} now={now} tableHref={tableHref} />
      </section>
    </div>
  );
}

/** Loading: the figures and columns in outline, matching the board's layout. */
export function BoardSkeleton() {
  return (
    <LoadingRegion label="Loading the workshop board" className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-[66px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-11 w-full rounded-md md:hidden" />
      <div className="flex gap-3 overflow-hidden">
        {BOARD_COLUMN_KEYS.map((key, index) => (
          <div
            key={key}
            className={cn(
              "w-64 shrink-0 space-y-2 rounded-xl border border-border p-2",
              index > 0 && "hidden md:block",
            )}
          >
            <Skeleton className="h-6 w-32 rounded-full" />
            {Array.from({ length: 3 - (index % 2) }, (_, card) => (
              <Skeleton key={card} className="h-40 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

function Notice({
  icon,
  title,
  children,
  tone = "default",
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-4 py-10 text-center",
        tone === "error" && "border-red-200",
      )}
    >
      <span
        className={cn(
          "text-muted-foreground",
          tone === "error" && "text-red-700",
        )}
      >
        {icon}
      </span>
      <p className="text-base font-semibold">{title}</p>
      {children}
    </div>
  );
}

export function BoardError({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <Notice
      icon={<AlertTriangle className="size-8" aria-hidden="true" />}
      title="Could not load the workshop board"
      tone="error"
    >
      <p className="max-w-md text-sm text-muted-foreground">
        Check your connection, then try again. Your filters are kept.
      </p>
      <Button variant="outline" onClick={onRetry} disabled={retrying}>
        <RefreshCw
          className={cn(
            "mr-2 size-4",
            retrying && "animate-spin motion-reduce:animate-none",
          )}
          aria-hidden="true"
        />
        {retrying ? "Trying again" : "Try again"}
      </Button>
    </Notice>
  );
}

export function BoardDenied({ branchName }: { branchName: string | null }) {
  return (
    <Notice
      icon={<ShieldOff className="size-8" aria-hidden="true" />}
      title="You cannot see this workshop board"
    >
      <p className="max-w-md text-sm text-muted-foreground">
        {branchName
          ? `Your account does not have access to ${branchName}. Choose your own branch, or ask your administrator for access.`
          : "Your account does not have access to job cards. Ask your administrator if you need it."}
      </p>
    </Notice>
  );
}

export function BoardEmpty({
  filtered,
  canCreate,
  onClear,
}: {
  filtered: boolean;
  canCreate: boolean;
  onClear: () => void;
}) {
  if (filtered)
    return (
      <Notice
        icon={<TableProperties className="size-8" aria-hidden="true" />}
        title="No active jobs match these filters"
      >
        <p className="max-w-md text-sm text-muted-foreground">
          Try another service advisor, technician or received date.
        </p>
        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      </Notice>
    );
  return (
    <Notice
      icon={<Car className="size-8" aria-hidden="true" />}
      title="No active jobs in the workshop"
    >
      <p className="max-w-md text-sm text-muted-foreground">
        {canCreate
          ? "Jobs appear here as soon as they are opened."
          : "Jobs appear here as soon as a service advisor opens a job card."}
      </p>
      {canCreate && (
        <Button asChild>
          <Link href="/job-cards/new">
            <Plus className="mr-2 size-4" aria-hidden="true" />
            Open a job card
          </Link>
        </Button>
      )}
    </Notice>
  );
}
