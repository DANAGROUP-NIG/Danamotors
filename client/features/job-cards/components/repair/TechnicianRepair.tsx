"use client";
import { useState } from "react";
import { CheckCircle2, ClipboardPlus, Clock, FileText, Loader2, Lock, Package, PackageCheck, PauseCircle, Play, RotateCcw, Truck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMoveWorkLine } from "../../hooks/use-job-repair";
import type { JobFileTab } from "../../lib/job-frame.logic";
import { FINDING_STATE_BADGE, PAYER_TAG, WORK_STATUS_BADGE, lineButton, partsSummary, timeWorkedText } from "../../lib/repair.logic";
import type { FindingItem } from "../../types/job-diagnosis.types";
import type { JobCard } from "../../types/job-card.types";
import type { JobRepairStep, WorkLine, WorkLineAction } from "../../types/job-repair.types";
import type { StageBarProps } from "../check-in/CheckInStep";
import { ItemPicker } from "../diagnosis/ItemPicker";
import { StageActionBar } from "../workspace/StageActionBar";
import { StageCard } from "../workspace/StageCard";
import { AssignTechnicianSection } from "../workspace/WorkshopSections";
import { CollectPartsSheet } from "./CollectPartsSheet";
import { NewFindingSheet, emptyFinding } from "./NewFindingSheet";
import { PauseJobDialog } from "./PauseJobDialog";
import type { FindingForm } from "../../lib/repair.logic";

/**
 * The technician's repair view, phone first: the approved work as a tick-list with big Start and
 * Done buttons, the parts card with Collect and sign, and Need a part, Add a finding and Pause job.
 * No prices anywhere.
 */
export function TechnicianRepair({
  job,
  step,
  bar,
  readOnly,
  onOpenTab,
}: {
  job: JobCard;
  step: JobRepairStep;
  bar: StageBarProps;
  readOnly: boolean;
  onOpenTab: (tab: JobFileTab) => void;
}) {
  const move = useMoveWorkLine(job.id);
  const { hasPermission } = useAuth();
  const canAssign = hasPermission("assignment:create");
  const [failedLine, setFailedLine] = useState<{ lineId: string; action: WorkLineAction; message: string } | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [finding, setFinding] = useState<{ kind: "PART" | "FINDING"; form: FindingForm } | null>(null);
  const [picking, setPicking] = useState<"LABOUR" | "PART" | null>(null);
  const [pausing, setPausing] = useState(false);
  const canWork = step.access.canWork && !readOnly;
  const pause = bar.secondary.find((view) => view.action === "PAUSE_FOR_PARTS");
  const pending = step.findings.filter((item) => item.state === "WAITING_ESTIMATE" || item.state === "WAITING_APPROVAL");
  const declined = step.findings.filter((item) => item.state === "DECLINED");
  const readyRows = step.parts.rows.filter((row) => row.status === "READY");
  const waitingRows = step.parts.rows.filter((row) => row.status === "REQUESTED" || row.status === "PARTLY_COLLECTED");

  function run(line: WorkLine, action: WorkLineAction) {
    if (move.isPending) return;
    setFailedLine(null);
    move
      .mutateAsync({ lineId: line.id, action, requestId: crypto.randomUUID() })
      .then(() => toast.success(action === "DONE" ? `${line.description} marked done` : action === "START" ? `${line.description} started` : `${line.description} is waiting for parts`))
      .catch((error: unknown) =>
        setFailedLine({ lineId: line.id, action, message: apiErrorMessage(error, "The work was not updated. Check your connection and try again.") }),
      );
  }

  const openFinding = (kind: "PART" | "FINDING") => setFinding({ kind, form: emptyFinding() });
  const addItem = (item: FindingItem) => {
    setFinding((current) =>
      current && !current.form.items.some((row) => row.referenceId === item.referenceId)
        ? { ...current, form: { ...current.form, items: [...current.form.items, { kind: item.kind === "LABOUR" ? "LABOUR" : "PART", referenceId: item.referenceId, description: item.description, quantity: "1" }] } }
        : current,
    );
    setPicking(null);
  };

  return (
    <>
      {step.returnedFromQc && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <RotateCcw className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Returned from quality check</p>
            <p>
              Returned by {step.returnedFromQc.by ?? "the workshop supervisor"}, {formatDateTime(step.returnedFromQc.at)}.
            </p>
            {step.returnedFromQc.note && <p className="mt-1">Note: {step.returnedFromQc.note}</p>}
          </div>
        </div>
      )}
      {step.paused && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <PauseCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          The job is paused while it waits for parts. Press Resume repair when the parts arrive.
        </p>
      )}

      <StageCard title="Your work" description="Approved work for this job. Complete each item below.">
        {step.workLines.length === 0 ? (
          <div className="space-y-3 text-sm">
            <p>No approved work is listed for this job. The work list comes from the approved estimate, and this job was released before work lists were kept.</p>
            <Button type="button" variant="outline" onClick={() => onOpenTab("documents")}>
              <FileText aria-hidden="true" />
              View the estimate
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {step.workLines.map((line) => (
              <WorkLineRow key={line.id} line={line} step={step} canWork={canWork} busy={move.isPending} running={move.isPending && move.variables?.lineId === line.id} failure={failedLine?.lineId === line.id ? failedLine : null} onRun={run} />
            ))}
            {pending.map((item) => (
              <li key={item.id} className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Lock className="size-5 text-muted-foreground" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="break-words font-medium">{item.items.map((row) => row.description).join(", ") || item.description}</p>
                  <StatusBadge status={FINDING_STATE_BADGE[item.state].label} tone={FINDING_STATE_BADGE[item.state].tone} className="text-xs normal-case" />
                  <p className="text-sm text-muted-foreground">Do not start this work until the customer approves it. The service advisor is preparing a supplementary estimate.</p>
                </div>
              </li>
            ))}
            {declined.map((item) => (
              <li key={item.id} className="flex items-start gap-3 rounded-xl border border-border p-3 text-muted-foreground">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Lock className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="break-words font-medium">{item.items.map((row) => row.description).join(", ") || item.description}</p>
                  <StatusBadge status={FINDING_STATE_BADGE.DECLINED.label} tone={FINDING_STATE_BADGE.DECLINED.tone} className="text-xs normal-case" />
                  <p className="text-sm">The customer declined this work. Do not do it.</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </StageCard>

      <StageCard title="Parts" id="job-parts">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Package className="size-5 text-muted-foreground" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium sm:text-base">{partsSummary(step.parts)}</p>
        </div>
        {step.parts.collectable.length > 0 &&
          (step.access.canCollect && !readOnly ? (
            <Button type="button" size="lg" className="w-full" onClick={() => setCollecting(true)}>
              <Truck aria-hidden="true" />
              Collect and sign
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Only the technician assigned to this job can sign for the parts.</p>
          ))}
        {(readyRows.length > 0 || waitingRows.length > 0) && (
          <ul className="divide-y divide-border border-t border-border text-sm">
            {readyRows.map((row) => (
              <li key={row.sparePartId} className="flex items-center gap-2 py-2">
                <PackageCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 break-words">
                  {row.description}: ready at the store{row.issuedAt ? `, issued ${formatTime(row.issuedAt)}` : ""}
                </span>
              </li>
            ))}
            {waitingRows.map((row) => (
              <li key={row.sparePartId} className="flex items-center gap-2 py-2 text-muted-foreground">
                <Clock className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{row.description}: requested from the store, not ready yet</span>
              </li>
            ))}
          </ul>
        )}
      </StageCard>

      {canWork && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <BigOutline icon={Package} label="Need a part" onClick={() => openFinding("PART")} />
          <BigOutline icon={ClipboardPlus} label="Add a finding" onClick={() => openFinding("FINDING")} />
          <BigOutline
            icon={PauseCircle}
            label="Pause job"
            disabledReason={step.paused ? "The job is already paused." : !pause ? "The job cannot be paused now." : !pause.enabled ? pause.reasons.join(" ") : null}
            onClick={() => setPausing(true)}
          />
        </div>
      )}

      {canAssign && <AssignTechnicianSection job={job} />}

      <StageActionBar {...bar} secondary={[]} note={bar.primary?.action === "SEND_TO_QC" && bar.primary.enabled ? "The workshop supervisor will do the quality check." : undefined} />

      {collecting && <CollectPartsSheet jobCardId={job.id} parts={step.parts.collectable} onClose={() => setCollecting(false)} />}
      {finding && !picking && (
        <NewFindingSheet
          jobCardId={job.id}
          kind={finding.kind}
          form={finding.form}
          onChange={(form) => setFinding((current) => (current ? { ...current, form } : current))}
          onPick={setPicking}
          onClose={() => setFinding(null)}
        />
      )}
      <ItemPicker jobCardId={job.id} kind={picking ?? "PART"} open={!!picking} onPick={addItem} onClose={() => setPicking(null)} />
      {pausing && (
        <PauseJobDialog
          jobNumber={step.jobNumber}
          pending={bar.pending === "PAUSE_FOR_PARTS"}
          onConfirm={(note) => bar.onNoteAction("PAUSE_FOR_PARTS", note, () => setPausing(false))}
          onClose={() => setPausing(false)}
        />
      )}
    </>
  );
}

function WorkLineRow({
  line,
  step,
  canWork,
  busy,
  running,
  failure,
  onRun,
}: {
  line: WorkLine;
  step: JobRepairStep;
  canWork: boolean;
  busy: boolean;
  running: boolean;
  failure: { action: WorkLineAction; message: string } | null;
  onRun: (line: WorkLine, action: WorkLineAction) => void;
}) {
  const button = lineButton(line, { paused: step.paused, canWork });
  const badge = WORK_STATUS_BADGE[line.status];
  const done = line.status === "DONE";
  const reasonId = `line-${line.id}-reason`;
  const Icon = done ? CheckCircle2 : Wrench;
  return (
    <li className={cn("rounded-xl border p-3", done ? "border-emerald-200 bg-emerald-50/40" : "border-border")}>
      {/* On phones the big button sits under the work's name at full width; beside it from the small breakpoint. */}
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", done ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="break-words font-medium">{line.description}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={done && line.doneAt ? `Done ${formatTime(line.doneAt)}` : badge.label} tone={badge.tone} className="text-xs normal-case" />
            {PAYER_TAG[line.payer] && <StatusBadge status={PAYER_TAG[line.payer]!} tone="purple" className="text-xs normal-case" />}
            {line.supplementary && <StatusBadge status="Added during repair" tone="gray" className="text-xs normal-case" />}
            {line.returnedFromQc && <StatusBadge status="Returned from quality check" tone="red" className="text-xs normal-case" />}
          </div>
          {(line.status === "IN_PROGRESS" || line.secondsWorked > 0) && !done && (
            <p className="text-xs text-muted-foreground">Time worked: {timeWorkedText(line.secondsWorked)}</p>
          )}
        </div>
        {/* Read only (someone else's job): statuses only, no buttons. */}
        {button && canWork && (
          <Button
            type="button"
            size="lg"
            variant={button.action === "DONE" ? "default" : "outline"}
            className="w-full shrink-0 sm:w-auto sm:min-w-28"
            disabled={!!button.disabledReason || busy}
            aria-describedby={button.disabledReason ? reasonId : undefined}
            onClick={() => onRun(line, button.action)}
          >
            {running ? <Loader2 className="animate-spin" aria-hidden="true" /> : button.action === "DONE" ? <CheckCircle2 aria-hidden="true" /> : <Play aria-hidden="true" />}
            {button.label}
          </Button>
        )}
      </div>
      {button?.disabledReason && canWork && (
        <p id={reasonId} className="mt-2 text-sm text-muted-foreground">
          {button.disabledReason}
        </p>
      )}
      {canWork && !done && line.status !== "WAITING_PARTS" && !step.paused && (
        <div className="mt-2 flex justify-end">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onRun(line, "WAIT_PARTS")}>
            <Clock aria-hidden="true" />
            Waiting parts
          </Button>
        </div>
      )}
      {failure && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span>{failure.message}</span>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onRun(line, failure.action)}>
            Try again
          </Button>
        </div>
      )}
    </li>
  );
}

function BigOutline({
  icon: Icon,
  label,
  onClick,
  disabledReason = null,
}: {
  icon: typeof Package;
  label: string;
  onClick: () => void;
  disabledReason?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        className="h-auto min-h-20 flex-1 flex-col gap-1.5 whitespace-normal px-2 py-3 text-center text-sm"
        disabled={!!disabledReason}
        title={disabledReason ?? undefined}
        aria-label={disabledReason ? `${label}. ${disabledReason}` : label}
        onClick={onClick}
      >
        <Icon className="size-6" aria-hidden="true" />
        {label}
      </Button>
      {disabledReason && <p className="text-center text-xs text-muted-foreground">{disabledReason}</p>}
    </div>
  );
}
