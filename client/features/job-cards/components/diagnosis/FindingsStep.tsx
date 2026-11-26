"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ClipboardList, Loader2, MessageSquareWarning, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFindingAutosave, useRemoveFinding } from "../../hooks/use-job-diagnosis";
import { MAX_EXTRA_FINDINGS, extraFindings, findingSummary, requestCards, returnedBanner } from "../../lib/diagnosis.logic";
import type { CustomerRequest, JobDiagnosis, JobFinding } from "../../types/job-diagnosis.types";
import { FindingEditor } from "./FindingEditor";

/** Lets the step's action bar save every finding before the job is handed on. */
export type FlushRegistry = Map<string, () => Promise<boolean>>;

/**
 * The technician's findings, phone first: the advisor's and supervisor's instructions, one card per
 * customer request, findings the customer did not mention, and the engineer's note when returned.
 */
export function FindingsStep({ diagnosis, registry }: { diagnosis: JobDiagnosis; registry: FlushRegistry }) {
  const cards = requestCards(diagnosis);
  const extras = extraFindings(diagnosis);
  const editable = diagnosis.editable;
  // New findings the technician added on this screen and has not saved yet (ids chosen here).
  const [added, setAdded] = useState<string[]>([]);
  const firstOpen = cards.find((card) => !card.finding?.causeAndDefect.trim())?.request.id ?? cards[0]?.request.id ?? null;
  const [open, setOpen] = useState<string | null>(firstOpen);
  const unsaved = added.filter((id) => !extras.some((finding) => finding.id === id));
  const extraCount = extras.length + unsaved.length;

  return (
    <div className="grid gap-4">
      {diagnosis.returned && (
        <div role="alert" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <MessageSquareWarning className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">{returnedBanner(diagnosis.returned, formatDateTime(diagnosis.returned.at))}</p>
            <p className="break-words text-sm">{diagnosis.returned.note}</p>
          </div>
        </div>
      )}
      <Instructions diagnosis={diagnosis} />
      {cards.map(({ request, finding }) => (
        <RequestCard
          key={request.id}
          jobCardId={diagnosis.jobCardId}
          request={request}
          finding={finding}
          editable={editable}
          open={open === request.id}
          onToggle={() => setOpen((current) => (current === request.id ? null : request.id))}
          registry={registry}
        />
      ))}
      {[...extras, ...unsaved.map((id) => ({ id, pending: true }) as const)].map((row, index) => (
        <ExtraCard
          key={row.id}
          jobCardId={diagnosis.jobCardId}
          number={cards.length + index + 1}
          finding={"pending" in row ? null : row}
          newId={row.id}
          editable={editable}
          registry={registry}
          onRemoved={() => setAdded((ids) => ids.filter((id) => id !== row.id))}
        />
      ))}
      {editable && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-auto min-h-12 w-full whitespace-normal py-3 text-center"
          disabled={extraCount >= MAX_EXTRA_FINDINGS}
          onClick={() => setAdded((ids) => [...ids, crypto.randomUUID()])}
        >
          <Plus aria-hidden="true" />
          Add a finding the customer did not mention
        </Button>
      )}
      {editable && extraCount >= MAX_EXTRA_FINDINGS && (
        <p className="text-sm text-muted-foreground">A job can have up to {MAX_EXTRA_FINDINGS} findings the customer did not mention.</p>
      )}
    </div>
  );
}

function Instructions({ diagnosis }: { diagnosis: JobDiagnosis }) {
  if (!diagnosis.instructions && !diagnosis.allocation?.note) return null;
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-muted/50 p-4">
      {diagnosis.instructions && (
        <div className="flex gap-3">
          <ClipboardList className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Instruction from the service advisor{diagnosis.advisorName ? ` (${diagnosis.advisorName})` : ""}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{diagnosis.instructions}</p>
          </div>
        </div>
      )}
      {diagnosis.allocation?.note && (
        <div className="flex gap-3">
          <ClipboardList className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Note from the workshop supervisor{diagnosis.allocation.by ? ` (${diagnosis.allocation.by})` : ""}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{diagnosis.allocation.note}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Registers this card's save with the action bar while it is on screen. */
function useRegister(registry: FlushRegistry, key: string, flush: () => Promise<boolean>) {
  const latest = useRef(flush);
  useEffect(() => {
    latest.current = flush;
  }, [flush]);
  useEffect(() => {
    registry.set(key, () => latest.current());
    return () => {
      registry.delete(key);
    };
  }, [key, registry]);
}

function RequestCard({
  jobCardId,
  request,
  finding,
  editable,
  open,
  onToggle,
  registry,
}: {
  jobCardId: string;
  request: CustomerRequest;
  finding: JobFinding | null;
  editable: boolean;
  open: boolean;
  onToggle: () => void;
  registry: FlushRegistry;
}) {
  const autosave = useFindingAutosave(jobCardId, request.id, finding, editable);
  useRegister(registry, request.id, autosave.flush);
  const panelId = useId();
  const written = !!autosave.draft.causeAndDefect.trim();
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn("flex min-h-16 w-full items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", open && "bg-muted/50")}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold" aria-hidden="true">
          {request.number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{request.description}</span>
          {!open && <span className={cn("block truncate text-sm", written ? "text-muted-foreground" : "text-amber-700")}>{findingSummary(autosave.draft)}</span>}
        </span>
        {!open && autosave.draft.possibleWarranty && <StatusBadge status="Possible warranty" tone="purple" className="shrink-0 text-xs normal-case" />}
        <ChevronDown className={cn("mt-1 size-5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="border-t border-border p-4">
          <FindingEditor jobCardId={jobCardId} autosave={autosave} photos={finding?.photos ?? []} editable={editable} />
        </div>
      )}
    </section>
  );
}

function ExtraCard({
  jobCardId,
  number,
  finding,
  newId,
  editable,
  registry,
  onRemoved,
}: {
  jobCardId: string;
  number: number;
  finding: JobFinding | null;
  newId: string;
  editable: boolean;
  registry: FlushRegistry;
  onRemoved: () => void;
}) {
  const autosave = useFindingAutosave(jobCardId, null, finding, editable, newId);
  useRegister(registry, newId, autosave.flush);
  const remove = useRemoveFinding(jobCardId);
  const [confirming, setConfirming] = useState(false);
  const removeFinding = useCallback(() => {
    if (!autosave.saved) {
      onRemoved();
      return;
    }
    remove.mutate(autosave.findingId, {
      onSuccess: () => {
        toast.success("Finding removed");
        setConfirming(false);
        onRemoved();
      },
      onError: (error) => toast.error(apiErrorMessage(error, "The finding was not removed. Check your connection and try again.")),
    });
  }, [autosave.findingId, autosave.saved, onRemoved, remove]);
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold" aria-hidden="true">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Finding the customer did not mention</h3>
          <p className="text-sm text-muted-foreground">The advisor will ask the customer before this work is done.</p>
        </div>
        {editable && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Remove this finding"
            title="Remove this finding"
            disabled={remove.isPending}
            onClick={() => (autosave.draft.causeAndDefect.trim() || autosave.draft.items.length || finding?.photos.length ? setConfirming(true) : removeFinding())}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        )}
      </div>
      <ModalFame
        isOpen={confirming}
        onClose={() => !remove.isPending && setConfirming(false)}
        preventAccidentalClose
        title="Remove this finding?"
        description={`"${findingSummary(autosave.draft)}" will be removed with its work, parts and photos.`}
      >
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={remove.isPending} onClick={() => setConfirming(false)}>
            Keep finding
          </Button>
          <Button type="button" variant="destructive" disabled={remove.isPending} onClick={removeFinding}>
            {remove.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {remove.isPending ? "Removing" : "Remove finding"}
          </Button>
        </div>
      </ModalFame>
      <div className="p-4">
        <FindingEditor jobCardId={jobCardId} autosave={autosave} photos={finding?.photos ?? []} editable={editable} />
      </div>
    </section>
  );
}
