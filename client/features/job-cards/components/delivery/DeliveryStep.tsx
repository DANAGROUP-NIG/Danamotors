"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useLateReasons } from "@/features/late-deliveries/hooks/use-late-deliveries";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { blockedSummary, collectorPerson, deliveryPayload, deliveryProblems, emptyDeliveryForm, type DeliveryForm } from "../../lib/delivery.logic";
import { useApproveRelease, useDeliver, useJobDelivery, useRequestRelease, useSignPhoneApprovals } from "../../hooks/use-job-delivery";
import { gatePassPrintHref } from "../../lib/job-print.logic";
import type { JobCard } from "../../types/job-card.types";
import type { JobWorkspace } from "../../types/job-workspace.types";
import type { StageBarProps } from "../check-in/CheckInStep";
import { StageActionBar } from "../workspace/StageActionBar";
import { StageCard } from "../workspace/StageCard";
import { BelongingsCard, CollectorCard, DeclinedCard, LateReasonsCard, PaymentBlockedCard, WorkDoneCard } from "./DeliveryCards";
import { DeliveredSummary } from "./DeliveredSummary";
import { ReleaseApprovalDialog } from "./ReleaseApprovalDialog";
import { DeliverySignatureCard, PhoneApprovalCard } from "./SignatureCards";

const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status;

/**
 * Step 8: Delivery, on the advisor's tablet with the customer. Work done and declined items, belongings ticked
 * as returned, who collects (terms clause 7), the estimate approved by phone signed first, late reasons after
 * the promised time, and the customer's delivery signature. "Complete delivery and print gate pass" closes the
 * job. Once delivered it shows the read-only summary. Others see the step read only.
 */
export function DeliveryStep({
  job,
  workspace,
  bar,
}: {
  job: JobCard;
  workspace: JobWorkspace;
  bar: StageBarProps;
}) {
  const query = useJobDelivery(job.id);
  const deliver = useDeliver(job.id, job.jobNumber);
  const signPhone = useSignPhoneApprovals(job.id);
  const approveRelease = useApproveRelease(job.id);
  const requestRelease = useRequestRelease(job.id);
  const step = query.data;
  const editable = !!step?.access.canDeliver && !workspace.readOnly;
  const lateReasons = useLateReasons();
  const [form, setForm] = useState<DeliveryForm>(emptyDeliveryForm);
  const [padKey, setPadKey] = useState(0);
  const [tried, setTried] = useState(false);
  const [approving, setApproving] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  // One request ID per attempt at the form: a double click or a retry after a lost answer delivers once.
  const requestId = useRef(crypto.randomUUID());
  const releaseRequestId = useRef(crypto.randomUUID());
  const router = useRouter();

  const quiet = { ...bar, primary: null, secondary: [] };
  if (query.isLoading)
    return (
      <>
        <LoadingSkeleton label="Loading delivery" />
        <StageActionBar {...quiet} />
      </>
    );
  if (statusOf(query.error) === 403)
    return (
      <StageCard title="Delivery">
        <p className="flex items-start gap-2 text-sm">
          <ShieldOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>You do not have access to this job&apos;s delivery. Staff of the job&apos;s branch with access to job cards can open it.</span>
        </p>
      </StageCard>
    );
  if (query.isError || !step)
    return (
      <>
        <StageCard title="Delivery">
          <p role="alert" className="text-sm">
            Delivery could not be loaded. Check your connection and try again.
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

  if (step.delivered) return <DeliveredSummary jobId={job.id} step={step} />;

  const busy = deliver.isPending || signPhone.isPending;
  const set = <K extends keyof DeliveryForm>(key: K, value: DeliveryForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const problems = deliveryProblems(step, form);
  const signer = collectorPerson(step, form.collector);
  const phoneFirst = step.phoneApprovals.length > 0;
  const reasonOptions = (lateReasons.data ?? []).filter((reason) => reason.active || form.lateReasonIds.includes(reason.id));

  const complete = () => {
    setTried(true);
    if (busy || problems.length) return;
    deliver.mutate(deliveryPayload(step, form, requestId.current), {
      // "Complete delivery and print gate pass": open the A6 slip, which prints as soon as it loads.
      onSuccess: () => router.push(gatePassPrintHref(job.id, true)),
      // A refused delivery gets a fresh request ID once the advisor changes something and tries again.
      onError: () => {
        requestId.current = crypto.randomUUID();
      },
    });
  };

  return (
    <>
      <div className="space-y-4">
        {step.paymentProblem && <PaymentBlockedCard problem={step.paymentProblem} invoiceId={step.invoiceId} />}
        <div className="grid gap-4 lg:grid-cols-2">
          <WorkDoneCard lines={step.workDone} />
          <DeclinedCard items={step.declined} />
          {phoneFirst && (
            <div className="lg:col-span-2">
              <PhoneApprovalCard
                key={step.phoneApprovals.map((approval) => approval.approvalId).join()}
                step={step}
                editable={step.access.canSignEstimate && !workspace.readOnly}
                pending={signPhone.isPending}
                failure={signPhone.error ? apiErrorMessage(signPhone.error, "The signature could not be saved. Check your connection and try again. Your entries are kept.") : null}
                onSign={(values) => signPhone.mutate({ requestId: crypto.randomUUID(), accepted: true, ...values })}
              />
            </div>
          )}
          <BelongingsCard step={step} returned={form.returned} editable={editable} disabled={busy} onChange={(codes) => set("returned", codes)} />
          <CollectorCard
            step={step}
            value={form.collector}
            editable={editable}
            disabled={busy}
            onChange={(type) => {
              set("collector", type);
              // A different collector signs again.
              set("signature", null);
              setPadKey((key) => key + 1);
            }}
            onApprove={() => {
              approveRelease.reset();
              setApproving(true);
            }}
            request={{
              name: requestName,
              onName: setRequestName,
              pending: requestRelease.isPending,
              error: requestError,
              onSend: () => {
                if (requestRelease.isPending) return;
                if (requestName.trim().length < 2) {
                  setRequestError("Enter the full name of the person collecting.");
                  return;
                }
                setRequestError(null);
                requestRelease.mutate(
                  { requestId: releaseRequestId.current, collectorName: requestName.trim() },
                  {
                    onSuccess: () => {
                      releaseRequestId.current = crypto.randomUUID();
                    },
                    onError: (error) => setRequestError(apiErrorMessage(error, "The managers could not be told. Check your connection and try again.")),
                  },
                );
              },
            }}
          />
          {step.late && (
            <div className="lg:col-span-2">
              <LateReasonsCard
                promisedAt={step.promisedAt}
                reasons={{
                  state: lateReasons.isLoading ? "loading" : lateReasons.isError ? "error" : "ready",
                  options: reasonOptions,
                  retry: () => void lateReasons.refetch(),
                }}
                selected={form.lateReasonIds}
                remarks={form.lateRemarks}
                disabled={!editable || busy}
                showError={tried}
                onChange={(ids) => set("lateReasonIds", ids)}
                onRemarks={(text) => set("lateRemarks", text)}
              />
            </div>
          )}
          {editable && (
            <div className="lg:col-span-2">
              <DeliverySignatureCard
                signer={signer?.name ?? null}
                disabled={busy}
                locked={phoneFirst ? "The customer signs the estimate approved by phone first. Then they sign here." : null}
                padKey={padKey}
                onChange={(image) => set("signature", image)}
              />
            </div>
          )}
        </div>
        {deliver.isError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {apiErrorMessage(deliver.error, "The delivery could not be saved. Check your connection and try again. Your entries are kept.")}
          </p>
        )}
      </div>

      {editable ? (
        <StageActionBar
          primary={{ action: "DELIVER", kind: "primary", enabled: problems.length === 0, reasons: problems, requiresNote: false }}
          secondary={[]}
          danger={bar.danger}
          pending={deliver.isPending ? "DELIVER" : null}
          onAction={complete}
          onDangerAction={bar.onDangerAction}
          note="The job closes and the gate pass prints."
          blockedReason={blockedSummary(problems)}
        />
      ) : (
        <StageActionBar {...quiet} />
      )}

      {approving && (
        <ReleaseApprovalDialog
          jobNumber={job.jobNumber}
          defaultName={requestName.trim()}
          pending={approveRelease.isPending}
          failure={approveRelease.error ? apiErrorMessage(approveRelease.error, "The approval could not be saved. Check your connection and try again. Your entries are kept.") : null}
          onClose={() => setApproving(false)}
          onConfirm={(values) =>
            approveRelease.mutate({ requestId: crypto.randomUUID(), ...values }, { onSuccess: () => setApproving(false) })
          }
        />
      )}
    </>
  );
}
