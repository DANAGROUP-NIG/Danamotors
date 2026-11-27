"use client";
import { useState } from "react";
import Link from "next/link";
import { FileText, Loader2, RefreshCw } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { formatMoney } from "@/lib/format";
import { storageDecisionSchema, type StorageDecisionValues } from "../../lib/billing.logic";
import { useCreateJobInvoice, useInvoicePreview } from "../../hooks/use-job-billing";
import type { JobBillingStep } from "../../types/job-billing.types";
import { StorageChargeDecision } from "./StorageChargeDecision";

const LINE_TYPE: Record<string, string> = { PART: "Part", LABOUR: "Labour", SERVICE: "Service charge" };

/**
 * Create invoice from the job: the existing job bill (readiness checks, consolidation, advances applied),
 * with no discount. A due storage charge needs an answer first. Discounts use Billing, Create job bill.
 * It closes only on Cancel, the close icon or success; a repeated click sends the same request.
 */
export function CreateInvoiceDialog({
  job,
  otherJobs,
  onClose,
}: {
  job: { id: string; jobNumber: string; serviceAdvisorId: string | null };
  otherJobs: JobBillingStep["otherVehicleJobs"];
  onClose: () => void;
}) {
  const [consolidate, setConsolidate] = useState(false);
  const [storage, setStorage] = useState<Partial<StorageDecisionValues>>({ reason: "" });
  const [tried, setTried] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const query = useInvoicePreview(job.id, consolidate, true);
  const create = useCreateJobInvoice(job.id);
  const preview = query.data?.preview;
  const proposal = preview?.storage ?? null;
  const advisorId = preview?.jobCard.serviceAdvisorId ?? job.serviceAdvisorId;

  const storageCheck = proposal ? storageDecisionSchema.safeParse({ decision: storage.decision, reason: storage.reason ?? "" }) : null;
  const storageErrors =
    tried && storageCheck && !storageCheck.success
      ? Object.fromEntries(storageCheck.error.issues.map((issue) => [String(issue.path[0] ?? "decision"), issue.message]))
      : {};
  const blocked = !preview
    ? null
    : !preview.review.canBill
      ? preview.review.issues[0] ?? "This job cannot be invoiced yet."
      : !advisorId
        ? "This job has no service advisor. Use Billing, Create job bill to choose one."
        : null;
  const pending = create.isPending;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setTried(true);
    if (pending || !preview || blocked || !advisorId || (storageCheck && !storageCheck.success)) return;
    create.mutate(
      {
        jobCardId: job.id,
        consolidateVehicle: consolidate,
        partsDiscountPercent: 0,
        labourDiscountPercent: 0,
        serviceAdvisorId: advisorId,
        requestId,
        ...(proposal && storageCheck?.success
          ? {
              storageCharge:
                storageCheck.data.decision === "ACCEPT" ? { decision: "ACCEPT" as const } : { decision: "REMOVE" as const, reason: storageCheck.data.reason },
            }
          : {}),
      },
      { onSuccess: onClose },
    );
  }

  const readyOthers = otherJobs.filter((other) => other.ready);
  return (
    <ModalFame isOpen onClose={pending ? () => undefined : onClose} title="Create invoice" description={`Invoice for job ${job.jobNumber}. Advances already paid are applied.`} preventAccidentalClose>
      <form className="space-y-4" noValidate onSubmit={submit}>
        {otherJobs.length > 0 && (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-semibold">Other open jobs on this vehicle</p>
            <ul className="space-y-1 text-sm">
              {otherJobs.map((other) => (
                <li key={other.id} className="flex flex-wrap justify-between gap-2">
                  <Link href={`/job-cards/${other.id}`} className="font-medium text-primary hover:underline">
                    Job {other.jobNumber}
                  </Link>
                  <span className="text-muted-foreground">{other.ready ? "Ready for billing" : "Not ready yet"}</span>
                </li>
              ))}
            </ul>
            <label className="flex min-h-11 items-start gap-3 pt-1 text-sm">
              <Checkbox checked={consolidate} disabled={pending} onCheckedChange={(checked) => setConsolidate(checked)} />
              <span>
                Bill all open jobs for this vehicle on one invoice.
                {readyOthers.length < otherJobs.length && " Every job must be ready first."}
              </span>
            </label>
          </div>
        )}

        {query.isLoading && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Calculating the invoice
          </p>
        )}
        {query.isError && (
          <div role="alert" className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            <p>{apiErrorMessage(query.error, "The invoice could not be calculated. Check your connection and try again.")}</p>
            <Button type="button" size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          </div>
        )}

        {preview && (
          <>
            {preview.jobCards && preview.jobCards.length > 1 && (
              <p className="text-sm">Jobs on this invoice: {preview.jobCards.map((card) => card.jobNumber).join(", ")}</p>
            )}
            <div className="max-h-56 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Invoice lines</caption>
                <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Line</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((line, index) => (
                    <tr key={`${line.type}-${index}`} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span className="block break-words">{line.description}</span>
                        <span className="text-xs text-muted-foreground">{LINE_TYPE[line.type] ?? "Charge"}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <dt>Parts</dt>
              <dd className="text-right tabular-nums">{formatMoney(preview.totals.partsTotal)}</dd>
              <dt>Labour</dt>
              <dd className="text-right tabular-nums">{formatMoney(preview.totals.labourTotal)}</dd>
              <dt>Service charge</dt>
              <dd className="text-right tabular-nums">{formatMoney(preview.totals.serviceTotal)}</dd>
              <dt>VAT</dt>
              <dd className="text-right tabular-nums">{formatMoney(preview.totals.vatAmount)}</dd>
              <dt>Round-off</dt>
              <dd className="text-right tabular-nums">{formatMoney(preview.totals.roundOff)}</dd>
              <dt className="border-t border-border pt-1 font-semibold">{proposal ? "Total before storage" : "Total"}</dt>
              <dd className="border-t border-border pt-1 text-right font-semibold tabular-nums">{formatMoney(preview.totals.total)}</dd>
            </dl>
            {proposal && (
              <StorageChargeDecision
                proposal={proposal}
                value={storage}
                errors={storageErrors}
                disabled={pending}
                onChange={setStorage}
              />
            )}
            {proposal && storage.decision === "ACCEPT" && (
              <p className="text-sm text-muted-foreground">The storage charge is added as a service line, with VAT, when the invoice is created.</p>
            )}
            {blocked && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                {blocked}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Need a discount?{" "}
              <Link href={`/invoices/new?jobCardId=${job.id}`} className="font-medium text-primary hover:underline">
                Use Billing, Create job bill
              </Link>
              .
            </p>
          </>
        )}

        {create.isError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {apiErrorMessage(create.error, "The invoice could not be created. Check your connection and try again.")}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !preview || !!blocked || query.isFetching}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileText aria-hidden="true" />}
            {pending ? "Creating invoice" : "Create invoice"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}
