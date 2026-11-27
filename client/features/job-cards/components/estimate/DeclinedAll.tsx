"use client";
import { useId, useState } from "react";
import { BadgeCheck, Ban, FileSignature, Loader2, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useAddEstimationCharge, useDecideWaiver, useRequestWaiver } from "../../hooks/use-job-estimate";
import { waiverReasonProblem } from "../../lib/estimate.logic";
import type { JobEstimateStep } from "../../types/job-estimate.types";
import { StageCard } from "../workspace/StageCard";

/**
 * The customer declined all work: terms clause 4 proposes the estimation charge. The advisor adds it
 * (it goes on the bill) or asks a manager to waive it with a reason; a manager approves or declines.
 */
export function DeclinedAll({ step, onCloseJob }: { step: JobEstimateStep; onCloseJob: () => void }) {
  const charge = step.estimationCharge;
  const record = charge?.record ?? null;
  const add = useAddEstimationCharge(step.jobCardId);
  const [requesting, setRequesting] = useState(false);
  const [deciding, setDeciding] = useState<"APPROVE" | "DECLINE" | null>(null);
  const amount = record?.amount ?? charge?.proposedAmount ?? null;

  function addCharge() {
    if (add.isPending) return;
    add
      .mutateAsync(crypto.randomUUID())
      .then(() => toast.success(`Estimation charge of ${formatMoney(amount)} added to job ${step.jobNumber}`))
      .catch((error: unknown) => toast.error(apiErrorMessage(error, "The estimation charge was not added. Check your connection and try again.")));
  }

  return (
    <StageCard title="The customer declined all work">
      {!record && (
        <>
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-amber-900">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span>
              The customer declined all work. An estimation charge of <span className="font-semibold tabular-nums">{formatMoney(amount)}</span> applies (terms clause 4).
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            The charge is the larger of {formatMoney(charge?.minimum)} and {Number(charge?.percent ?? 0)}% of the estimate total. A waiver needs manager approval and a reason.
          </p>
          {step.access.canEdit ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" disabled={add.isPending} onClick={addCharge}>
                {add.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
                {add.isPending ? "Adding charge" : "Add estimation charge"}
              </Button>
              <Button type="button" variant="outline" disabled={add.isPending} onClick={() => setRequesting(true)}>
                <FileSignature aria-hidden="true" />
                Request waiver
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">The service advisor adds the charge or asks a manager to waive it.</p>
          )}
        </>
      )}

      {record?.status === "ADDED" && (
        <div className="space-y-1 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <BadgeCheck className="size-5 text-emerald-700" aria-hidden="true" />
            Estimation charge {formatMoney(record.amount)} added by {record.createdBy ?? "the service advisor"}, {formatDateTime(record.createdAt)}.
          </p>
          {record.decidedBy && (
            <p className="text-muted-foreground">
              Waiver declined by {record.decidedBy}, {formatDateTime(record.decidedAt)}. {record.decisionNote ? `Note: ${record.decisionNote}` : ""}
            </p>
          )}
          <p className="text-muted-foreground">Send the job to billing. The bill has the estimation charge only.</p>
        </div>
      )}

      {record?.status === "WAIVER_REQUESTED" && (
        <div className="space-y-3 text-sm">
          <p>
            <span className="font-medium">Waiver requested</span> by {record.waiverRequestedBy ?? "the service advisor"}, {formatDateTime(record.waiverRequestedAt)}. Reason: {record.waiverReason}
          </p>
          {step.access.canDecideWaiver ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={() => setDeciding("APPROVE")}>
                <BadgeCheck aria-hidden="true" />
                Approve waiver
              </Button>
              <Button type="button" variant="outline" onClick={() => setDeciding("DECLINE")}>
                <Ban aria-hidden="true" />
                Decline waiver
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">Waiting for a service manager or workshop manager to approve or decline the waiver.</p>
          )}
        </div>
      )}

      {record?.status === "WAIVED" && (
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <BadgeCheck className="size-5 text-emerald-700" aria-hidden="true" />
            Estimation charge waived by {record.decidedBy ?? "a manager"}, {formatDateTime(record.decidedAt)}.
          </p>
          <p className="text-muted-foreground">Reason given: {record.waiverReason}. There is nothing to bill. Close the job and return the vehicle.</p>
          {step.access.canEdit && (
            <Button type="button" variant="outline" onClick={onCloseJob}>
              <Ban aria-hidden="true" />
              Close job without charge
            </Button>
          )}
        </div>
      )}

      <WaiverRequestDialog jobCardId={step.jobCardId} jobNumber={step.jobNumber} open={requesting} onClose={() => setRequesting(false)} />
      {deciding && <WaiverDecisionDialog jobCardId={step.jobCardId} jobNumber={step.jobNumber} approve={deciding === "APPROVE"} onClose={() => setDeciding(null)} />}
    </StageCard>
  );
}

function WaiverRequestDialog({ jobCardId, jobNumber, open, onClose }: { jobCardId: string; jobNumber: string; open: boolean; onClose: () => void }) {
  const request = useRequestWaiver(jobCardId);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const id = useId();
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (request.isPending) return;
    const problem = waiverReasonProblem(reason);
    setError(problem);
    if (problem) return;
    request
      .mutateAsync({ reason: reason.trim(), requestId })
      .then(() => {
        toast.success(`Waiver requested for job ${jobNumber}. The managers have been notified.`);
        onClose();
      })
      .catch((failure: unknown) => setError(apiErrorMessage(failure, "The waiver request was not sent. Check your connection and try again.")));
  }
  return (
    <ModalFame isOpen={open} onClose={request.isPending ? () => undefined : onClose} title="Request waiver" description="A service manager or workshop manager approves or declines it." preventAccidentalClose>
      <form onSubmit={submit} noValidate className="space-y-4 px-5 py-5 sm:px-6">
        <div>
          <label htmlFor={id} className="text-sm font-medium">
            Reason for the waiver <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <textarea
            id={id}
            className={`${inputCls} min-h-24`}
            maxLength={1000}
            value={reason}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => setReason(event.target.value)}
          />
          {error && (
            <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={request.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={request.isPending}>
            {request.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {request.isPending ? "Sending request" : "Send waiver request"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}

function WaiverDecisionDialog({ jobCardId, jobNumber, approve, onClose }: { jobCardId: string; jobNumber: string; approve: boolean; onClose: () => void }) {
  const decide = useDecideWaiver(jobCardId);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const id = useId();
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (decide.isPending) return;
    if (!approve && note.trim().length < 5) {
      setError("Write why the waiver is declined (at least 5 characters)");
      return;
    }
    setError(null);
    decide
      .mutateAsync({ approve, note: note.trim() || undefined, requestId })
      .then(() => {
        toast.success(approve ? `Estimation charge waived for job ${jobNumber}` : `Waiver declined for job ${jobNumber}. The estimation charge stays on the bill.`);
        onClose();
      })
      .catch((failure: unknown) => setError(apiErrorMessage(failure, "The decision was not saved. Check your connection and try again.")));
  }
  return (
    <ModalFame isOpen onClose={decide.isPending ? () => undefined : onClose} title={approve ? "Approve waiver" : "Decline waiver"} preventAccidentalClose>
      <form onSubmit={submit} noValidate className="space-y-4 px-5 py-5 sm:px-6">
        <div>
          <label htmlFor={id} className="text-sm font-medium">
            {approve ? "Note (optional)" : "Why the waiver is declined"}
            {!approve && <span className="text-destructive" aria-hidden="true"> *</span>}
          </label>
          <textarea
            id={id}
            className={`${inputCls} min-h-20`}
            maxLength={1000}
            value={note}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => setNote(event.target.value)}
          />
          {error && (
            <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={decide.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={decide.isPending}>
            {decide.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {decide.isPending ? "Saving" : approve ? "Approve waiver" : "Decline waiver"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}
