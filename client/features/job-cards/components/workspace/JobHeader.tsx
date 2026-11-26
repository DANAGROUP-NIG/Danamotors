"use client";
import Link from "next/link";
import { ArrowLeft, ChevronDown, FileText, FolderOpen, Printer } from "lucide-react";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { RepeatTag } from "@/features/repeat-jobs/components/repeat-ui";
import { NOT_PROVIDED, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { customerName, promiseCountdown, vehicleTitle } from "../../lib/job-frame.logic";
import { jobStageBadge, ownerLine } from "../../lib/job-stage.logic";
import type { JobCard } from "../../types/job-card.types";
import type { JobWorkspace } from "../../types/job-workspace.types";

export interface PrintItem {
  label: string;
  href?: string;
  onSelect?: () => void;
}

const COUNTDOWN_TONE = {
  normal: "text-muted-foreground",
  soon: "font-medium text-amber-700",
  overdue: "font-medium text-red-700",
} as const;

/** The job header: who, what, where it is and with whom. Sticky at the top of the page. */
export function JobHeader({
  job,
  workspace,
  now,
  printItems,
  onOpenJobFile,
}: {
  job: JobCard;
  workspace: JobWorkspace;
  now: Date;
  printItems: PrintItem[];
  onOpenJobFile: () => void;
}) {
  const badge = jobStageBadge(workspace.stage, workspace.status);
  const countdown = promiseCountdown(job.promisedAt, workspace.stage, now);
  const owner = ownerLine(workspace);
  const plate = job.vehicle?.registrationNumber || job.vehicle?.vin || NOT_PROVIDED;
  const phone = job.customer?.phoneNumber?.trim();
  return (
    <header className="relative z-20 -mx-4 md:sticky md:top-0 border-b border-border bg-card/95 px-4 pb-3 pt-3 backdrop-blur supports-[backdrop-filter]:bg-card/90 lg:-mx-5 lg:px-5 print:hidden">
      <Link
        href="/job-cards"
        className="mb-2 inline-flex items-center gap-1 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Job cards
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold sm:text-xl">
            <span className="text-sm font-medium text-muted-foreground sm:text-xl sm:font-semibold sm:text-foreground">{job.jobNumber}</span>
            <span className="hidden h-5 w-px bg-border sm:inline-block" aria-hidden="true" />
            <span className="basis-full sm:basis-auto">{plate}</span>
            <span className="hidden h-5 w-px bg-border sm:inline-block" aria-hidden="true" />
            <span className="text-base font-medium sm:text-xl sm:font-semibold">{vehicleTitle(job.vehicle)}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <span className="hidden sm:inline">
              {customerName(job.customer)}
              {phone ? `, ${phone}` : ""}
            </span>
            <StatusBadge status={badge.label} tone={badge.tone} className="text-xs normal-case" />
            <StatusBadge
              status={workspace.warrantyJob ? "Warranty" : "Non-warranty"}
              tone={workspace.warrantyJob ? "purple" : "gray"}
              className="hidden text-xs normal-case sm:inline-flex"
            />
            {job.repeatRecord && <RepeatTag status={job.repeatRecord.status} className="hidden text-xs sm:inline-flex" />}
          </div>
          {owner && <p className="truncate text-sm text-muted-foreground">{owner}</p>}
        </div>
        <div className="flex shrink-0 items-start gap-4">
          <div className="hidden text-right text-sm xl:block">
            <p>
              <span className="text-muted-foreground">Promised delivery: </span>
              <span className="font-medium tabular-nums">{formatDateTime(job.promisedAt)}</span>
            </p>
            {countdown && <p className={cn("tabular-nums", COUNTDOWN_TONE[countdown.tone])}>{countdown.text}</p>}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onOpenJobFile} aria-label="Job file" title="Job file">
              <FolderOpen aria-hidden="true" />
              <span className="hidden sm:inline">Job file</span>
            </Button>
            <ActionMenu
              trigger={
                <Button type="button" variant="outline" aria-label="Print" title="Print">
                  <Printer aria-hidden="true" />
                  <span className="hidden sm:inline">Print</span>
                  <ChevronDown className="hidden sm:block" aria-hidden="true" />
                </Button>
              }
            >
              {printItems.length ? (
                printItems.map((item) =>
                  item.href ? (
                    <ActionMenuItem key={item.label} asChild>
                      <Link
                        href={item.href}
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                        {item.label}
                      </Link>
                    </ActionMenuItem>
                  ) : (
                    <ActionMenuItem key={item.label} icon={<FileText />} onClick={item.onSelect}>
                      {item.label}
                    </ActionMenuItem>
                  ),
                )
              ) : (
                <p className="px-2.5 py-2 text-sm text-muted-foreground">Nothing to print for this job yet.</p>
              )}
            </ActionMenu>
          </div>
        </div>
      </div>
      {/* Below 1280 px the promised time sits under the owner line, so the title keeps its width. Phones show only plate, model, badge and owner. */}
      <p className="mt-1 hidden text-sm sm:block xl:hidden">
        <span className="text-muted-foreground">Promised: </span>
        <span className="tabular-nums">{formatDateTime(job.promisedAt)}</span>
        {countdown && <span className={cn("ml-2 tabular-nums", COUNTDOWN_TONE[countdown.tone])}>{countdown.text}</span>}
      </p>
    </header>
  );
}
