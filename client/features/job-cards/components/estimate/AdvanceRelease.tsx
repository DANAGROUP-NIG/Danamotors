"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Landmark, Loader2, Package, PenLine, Phone, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { PaymentReceiptModal } from "@/features/invoices/components/PaymentReceiptModal";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useLinkJobAdvance } from "../../hooks/use-job-advances";
import { useAdvanceExemption, useRetryPartsRequest } from "../../hooks/use-job-estimate";
import { EXEMPTION_OPTIONS, exemptionReasonProblem } from "../../lib/estimate.logic";
import type { JobEstimateStep, ManualExemption } from "../../types/job-estimate.types";
import { StageCard } from "../workspace/StageCard";
import { WorkshopPicker } from "../WorkshopPicker";

type Step = JobEstimateStep & { estimate: NonNullable<JobEstimateStep["estimate"]> };
type Row = { tone: "done" | "waiting" | "failed"; icon: typeof PenLine; title: string; detail: string; action?: React.ReactNode };

const MODE_LABEL: Record<string, string> = { CASH: "cash", BANK_TRANSFER: "bank transfer", POS: "card (POS)", CARD: "card", CHEQUE: "cheque", ONLINE: "online payment" };

/** "Before work starts": approval, advance and parts request, then the Advance card. */
export function AdvanceRelease({ step, job }: { step: Step; job: { id: string; customerId?: string | null; branchId: string; jobNumber?: string | null } }) {
  const { estimate, advance } = step;
  const approval = estimate.approval!;
  const retry = useRetryPartsRequest(step.jobCardId);
  const declined = approval.declinedCount;
  const approvalRow: Row =
    approval.channel === "PHONE"
      ? {
          tone: "done",
          icon: Phone,
          title: `Customer approved ${approval.approvedCount} ${approval.approvedCount === 1 ? "item" : "items"} by phone`,
          detail: `${approval.approverName ?? "Not provided"}, ${approval.approverPhone ?? "Not provided"}, ${formatDateTime(approval.approvedAt)}. Recorded by ${approval.recordedBy ?? "the service advisor"}. Customer to sign at delivery.${declined ? ` ${declined} declined.` : ""}`,
        }
      : {
          tone: approval.signatureState === "invalid" ? "failed" : "done",
          icon: PenLine,
          title:
            approval.signatureState === "invalid"
              ? "The signature no longer matches the estimate"
              : `Customer approved ${approval.approvedCount} ${approval.approvedCount === 1 ? "item" : "items"}`,
          detail: `Signed by ${approval.signerName ?? "the customer"}${approval.relationship === "Representative" ? ` (Representative, ${approval.signerPhone ?? "Not provided"})` : ""}, ${formatDateTime(approval.signedAt ?? approval.decidedAt)}.${declined ? ` ${declined} declined, kept as recommended work.` : ""}`,
        };
  const lastReceipt = advance.receipts.at(-1);
  const advanceRow: Row = !advance.required
    ? { tone: "done", icon: Landmark, title: `Advance not required: ${advance.exemptionLabel ?? "exempt"}`, detail: `${advance.exemptionReason ?? ""}${advance.exemptedBy ? ` Recorded by ${advance.exemptedBy}, ${formatDateTime(advance.exemptedAt)}.` : ""}` }
    : lastReceipt
      ? {
          tone: "done",
          icon: Landmark,
          title: `Advance received: ${formatMoney(advance.received)}`,
          detail: `${MODE_LABEL[lastReceipt.mode] ? `By ${MODE_LABEL[lastReceipt.mode]}, ` : ""}receipt ${lastReceipt.number}, recorded by ${lastReceipt.recordedBy ?? "the cashier"}, ${formatDateTime(lastReceipt.at)}.`,
        }
      : { tone: "waiting", icon: Landmark, title: "Advance not received", detail: `Suggested ${formatMoney(advance.suggestedAmount)} (${Number(advance.suggestedPercent)}%). Any positive amount is accepted.` };
  const parts = step.partsRequest;
  const partsRow: Row = !parts.needed
    ? { tone: "done", icon: Package, title: "No parts to request", detail: "The approved work has no parts or oil." }
    : parts.status === "SENT"
      ? {
          tone: "done",
          icon: Package,
          title: `Parts request sent to store automatically: ${parts.itemCount} ${parts.itemCount === 1 ? "item" : "items"}`,
          detail: `${parts.storeManagers.length ? `${parts.storeManagers.join(", ")} notified` : "Store notified"}, ${formatDateTime(parts.sentAt)}.`,
        }
      : {
          tone: "failed",
          icon: Package,
          title: "Parts request not sent",
          detail: `${parts.failure ?? "The store was not told about the approved parts."} Stock has not changed.`,
          action: step.access.canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={retry.isPending}
              onClick={() =>
                retry
                  .mutateAsync(crypto.randomUUID())
                  .then((result) =>
                    result.partsRequest.status === "SENT"
                      ? toast.success(`Parts request sent to the store for job ${step.jobNumber}`)
                      : toast.error(result.partsRequest.failure ?? "The parts request was not sent."),
                  )
                  .catch((error: unknown) => toast.error(apiErrorMessage(error, "The parts request was not sent. Check your connection and try again.")))
              }
            >
              {retry.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              Retry parts request
            </Button>
          ) : undefined,
        };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <StageCard title="Before work starts" description="Confirm that everything needed before work is in place.">
        <ul className="space-y-2">
          {[approvalRow, advanceRow, partsRow].map((row) => (
            <ChecklistRow key={row.title} row={row} />
          ))}
        </ul>
      </StageCard>
      <div className="space-y-4">
        <AdvanceCard step={step} job={job} />
        {step.access.canExempt && <ExemptionCard step={step} />}
      </div>
    </div>
  );
}

function ChecklistRow({ row }: { row: Row }) {
  const Icon = row.icon;
  const Status = row.tone === "done" ? CheckCircle2 : TriangleAlert;
  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-lg border px-3 py-3",
        row.tone === "done" ? "border-border" : row.tone === "waiting" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-900",
      )}
    >
      <Status className={cn("mt-0.5 size-5 shrink-0", row.tone === "done" && "text-emerald-700")} aria-label={row.tone === "done" ? "Done" : "Needs attention"} />
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{row.title}</p>
        <p className="break-words">{row.detail}</p>
      </div>
      {row.action}
    </li>
  );
}

function AdvanceCard({ step, job }: { step: Step; job: { id: string; customerId?: string | null; branchId: string; jobNumber?: string | null } }) {
  const { advance } = step;
  const [receiving, setReceiving] = useState(false);
  const [receiptId, setReceiptId] = useState("");
  const link = useLinkJobAdvance(step.jobCardId);
  const receivedNothing = Number(advance.received) <= 0;
  return (
    <StageCard title="Advance">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt>Approved customer total</dt>
          <dd className="tabular-nums">{formatMoney(advance.payable)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Suggested advance ({Number(advance.suggestedPercent)}%)</dt>
          <dd className="tabular-nums">{formatMoney(advance.suggestedAmount)}</dd>
        </div>
        <div className={cn("flex justify-between gap-3 rounded-lg px-3 py-2 font-semibold", !advance.required ? "bg-muted" : receivedNothing ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800")}>
          <dt>Received</dt>
          <dd className="tabular-nums">{formatMoney(advance.received)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Balance at billing</dt>
          <dd className="tabular-nums">{formatMoney(advance.balance)}</dd>
        </div>
      </dl>
      {advance.receipts.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-2 text-sm">
          {advance.receipts.map((receipt) => (
            <li key={receipt.id} className="flex flex-wrap justify-between gap-2">
              <span>
                {receipt.number}, {formatDateTime(receipt.at)}, <span className="tabular-nums">{formatMoney(receipt.amount)}</span>
              </span>
              <Link className="text-primary underline" href={`/finance/receipts/${receipt.id}/print`}>
                View receipt
              </Link>
            </li>
          ))}
        </ul>
      )}
      {step.access.canReceive && advance.required && job.customerId && (
        <div className="space-y-3 border-t border-border pt-3">
          <Button type="button" className="w-full" onClick={() => setReceiving(true)}>
            <Landmark aria-hidden="true" />
            Receive advance
          </Button>
          <details>
            <summary className="cursor-pointer text-sm">Link an existing unallocated receipt</summary>
            <div className="mt-3 space-y-3">
              <WorkshopPicker
                label="Service receipt"
                endpoint={`/finance/receipts?customerId=${job.customerId}&branchId=${job.branchId}&category=SERVICE_PARTS`}
                collection="receipts"
                value={receiptId}
                onChange={setReceiptId}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!receiptId || link.isPending}
                onClick={() =>
                  link.mutate(receiptId, {
                    onSuccess: () => {
                      setReceiptId("");
                      toast.success(`Advance receipt linked to job ${step.jobNumber}`);
                    },
                  })
                }
              >
                {link.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                Link advance receipt
              </Button>
              {link.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {apiErrorMessage(link.error, "The receipt was not linked. Check your connection and try again.")}
                </p>
              )}
            </div>
          </details>
          <PaymentReceiptModal
            isOpen={receiving}
            onClose={() => setReceiving(false)}
            job={{ id: job.id, customerId: job.customerId, branchId: job.branchId, jobNumber: job.jobNumber ?? step.jobNumber }}
          />
        </div>
      )}
    </StageCard>
  );
}

/** A service or workshop manager records why no advance is needed. TODO(confirm) who may do this. */
export function ExemptionCard({ step }: { step: Step }) {
  const save = useAdvanceExemption(step.jobCardId);
  const recorded = !step.advance.required && !step.advance.automatic;
  const [exemption, setExemption] = useState<ManualExemption | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  if (!step.advance.required && step.advance.automatic) return null;
  function submit(clear: boolean) {
    if (save.isPending) return;
    if (!clear) {
      const problem = !exemption ? "Choose why no advance is needed" : exemptionReasonProblem(reason);
      setError(problem);
      if (problem) return;
    }
    save
      .mutateAsync(clear ? { exemption: null } : { exemption: exemption as ManualExemption, reason: reason.trim() })
      .then(() => {
        toast.success(clear ? `Advance needed again for job ${step.jobNumber}` : `No advance needed for job ${step.jobNumber}`);
        setExemption("");
        setReason("");
      })
      .catch((failure: unknown) => setError(apiErrorMessage(failure, "The change was not saved. Check your connection and try again.")));
  }
  return (
    <StageCard title="No advance needed" description="For a free service, an internal job or a customer with approved credit. A manager records the reason.">
      {recorded ? (
        <div className="space-y-2 text-sm">
          <StatusBadge status={step.advance.exemptionLabel ?? "Exempt"} tone="gray" className="normal-case" />
          <p>{step.advance.exemptionReason}</p>
          <Button type="button" variant="outline" size="sm" disabled={save.isPending} onClick={() => submit(true)}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Ask for an advance again
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor={`${id}-type`} className="text-sm font-medium">
              Why no advance is needed
            </label>
            <select id={`${id}-type`} className={inputCls} value={exemption} onChange={(event) => setExemption(event.target.value as ManualExemption | "")}>
              <option value="">Choose a reason</option>
              {EXEMPTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-reason`} className="text-sm font-medium">
              Details
            </label>
            <textarea id={`${id}-reason`} className={`${inputCls} min-h-16`} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="button" variant="outline" disabled={save.isPending} onClick={() => submit(false)}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Record no advance needed
          </Button>
        </div>
      )}
    </StageCard>
  );
}
