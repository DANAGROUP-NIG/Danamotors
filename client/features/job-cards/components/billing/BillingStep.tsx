"use client";
import { useState } from "react";
import { Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { PaymentReceiptModal } from "@/features/invoices/components/PaymentReceiptModal";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { useJobBilling, useMarkReady, useNotifyAgain, useSetWashed } from "../../hooks/use-job-billing";
import type { JobCard } from "../../types/job-card.types";
import type { JobWorkspace } from "../../types/job-workspace.types";
import type { StageBarProps } from "../check-in/CheckInStep";
import { StageActionBar } from "../workspace/StageActionBar";
import { StageCard } from "../workspace/StageCard";
import { ComparisonCard, CustomerNoticeCard, InvoiceCard } from "./BillingCards";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { CreditApprovalDialog } from "./CreditApprovalDialog";
import { ReadyNoticeDialog } from "./ReadyNoticeDialog";

const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status;
type Dialog = "ready" | "again" | "invoice" | "payment" | "credit" | null;

/**
 * Step 7: Billing. The advisor marks the vehicle ready and records how the customer was told (the storage
 * counter starts), ticks the wash, and compares estimated with actual; billing staff create the invoice,
 * cashiers record payment, managers may approve credit. "Send to delivery" waits for payment, credit or
 * nothing to pay. Everyone else sees the same figures, read only.
 */
export function BillingStep({ job, workspace, bar }: { job: JobCard; workspace: JobWorkspace; bar: StageBarProps }) {
  const query = useJobBilling(job.id);
  const markReady = useMarkReady(job.id, job.jobNumber);
  const notifyAgain = useNotifyAgain(job.id);
  const washed = useSetWashed(job.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  // One request ID per open dialog: a double click or a retry after a lost answer records once.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const open = (next: Dialog) => {
    setRequestId(crypto.randomUUID());
    markReady.reset();
    notifyAgain.reset();
    setDialog(next);
  };
  const quiet = { ...bar, primary: null, secondary: [] };

  if (query.isLoading)
    return (
      <>
        <LoadingSkeleton label="Loading billing" />
        <StageActionBar {...quiet} />
      </>
    );
  if (statusOf(query.error) === 403)
    return (
      <>
        <StageCard title="Billing">
          <p className="flex items-start gap-2 text-sm">
            <ShieldOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>You do not have access to this job&apos;s billing. Staff of the job&apos;s branch with access to job cards can open it.</span>
          </p>
        </StageCard>
        <StageActionBar {...quiet} />
      </>
    );
  if (query.isError || !query.data)
    return (
      <>
        <StageCard title="Billing">
          <p role="alert" className="text-sm">
            Billing could not be loaded. Check your connection and try again.
          </p>
          <div>
            <Button type="button" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
              {query.isFetching ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              Try again
            </Button>
          </div>
        </StageCard>
        <StageActionBar {...quiet} />
      </>
    );

  const step = query.data;
  const readOnly = workspace.readOnly;
  const noticePending = markReady.isPending || notifyAgain.isPending;
  const noticeError = markReady.error ?? notifyAgain.error;
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <CustomerNoticeCard
          step={step}
          readOnly={readOnly}
          washPending={washed.isPending ? washed.variables : undefined}
          onSendAgain={() => open("again")}
          onWashed={(value) => {
            if (!washed.isPending) washed.mutate(value);
          }}
        />
        <ComparisonCard step={step} />
        <InvoiceCard
          step={step}
          readOnly={readOnly}
          onCreateInvoice={() => open("invoice")}
          onRecordPayment={() => open("payment")}
          onApproveCredit={() => open("credit")}
        />
      </div>
      {washed.isError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {apiErrorMessage(washed.error, "Vehicle washed could not be saved. Check your connection and try again.")}
        </p>
      )}

      <StageActionBar
        {...bar}
        // Marking ready also records how the customer was told: it opens the notice form first.
        onAction={(action) => (action === "MARK_READY" ? open("ready") : bar.onAction(action))}
        note={bar.primary?.action === "SEND_TO_DELIVERY" ? "The job goes to the Delivery step with the service advisor." : undefined}
      />

      {(dialog === "ready" || dialog === "again") && (
        <ReadyNoticeDialog
          mode={dialog}
          phone={step.customerPhone}
          pending={noticePending}
          failure={noticeError ? apiErrorMessage(noticeError, "The notice could not be saved. Check your connection and try again. Your entries are kept.") : null}
          onClose={() => setDialog(null)}
          onConfirm={(values) => {
            const body = { requestId, channel: values.channel, note: values.note.trim() || null };
            (dialog === "ready" ? markReady : notifyAgain).mutate(body, { onSuccess: () => setDialog(null) });
          }}
        />
      )}
      {dialog === "invoice" && (
        <CreateInvoiceDialog
          job={{ id: job.id, jobNumber: job.jobNumber, serviceAdvisorId: job.serviceAdvisorId ?? null }}
          otherJobs={step.otherVehicleJobs}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "credit" && (
        <CreditApprovalDialog job={{ id: job.id, jobNumber: job.jobNumber }} balanceDue={step.invoice?.balanceDue ?? step.draft?.balanceDue ?? null} onClose={() => setDialog(null)} />
      )}
      <PaymentReceiptModal isOpen={dialog === "payment" && !!step.invoice} invoiceId={step.invoice?.id} onClose={() => setDialog(null)} />
    </>
  );
}
