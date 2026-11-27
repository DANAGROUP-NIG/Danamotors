"use client";
import { useId, useState } from "react";
import { FileSignature, Loader2, PenLine } from "lucide-react";
import { inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { DELIVERY_STATEMENT, PHONE_APPROVAL_STATEMENT, phoneApprovalLine, signerNameSchema } from "../../lib/delivery.logic";
import type { JobDeliveryStep } from "../../types/job-delivery.types";
import { SignaturePad } from "../SignaturePad";
import { StageCard } from "../workspace/StageCard";

/**
 * "Estimate approved by phone": the customer signs, at the counter, the work they approved on the phone. This
 * comes before the delivery signature. The entries stay on screen if the save fails.
 */
export function PhoneApprovalCard({
  step,
  editable,
  pending,
  failure,
  onSign,
}: {
  step: Pick<JobDeliveryStep, "phoneApprovals" | "owner">;
  editable: boolean;
  pending: boolean;
  failure: string | null;
  onSign: (values: { signerName: string; signatureImage: string }) => void;
}) {
  const ids = useId();
  const [name, setName] = useState(() => step.phoneApprovals[0]?.approverName?.trim() || step.owner.name);
  const [signature, setSignature] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const nameProblem = signerNameSchema.safeParse(name).error?.issues[0]?.message ?? null;
  const changed = step.phoneApprovals.find((approval) => !approval.matches);
  const submit = () => {
    setTried(true);
    if (pending || nameProblem || !signature || changed) return;
    onSign({ signerName: name.trim(), signatureImage: signature });
  };
  return (
    <StageCard title="Estimate approved by phone" description="The customer approved this work on the phone. They sign for it here first, then for the delivery.">
      <div className="space-y-3">
        {step.phoneApprovals.map((approval) => (
          <div key={approval.approvalId} className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-semibold">{phoneApprovalLine(approval)}</p>
            <ul className="space-y-1 text-sm">
              {approval.items.map((item, index) => (
                <li key={`${index}-${item.description}`} className="flex items-start justify-between gap-3">
                  <span className="min-w-0 break-words">{item.description}</span>
                  <span className="shrink-0 tabular-nums">{formatMoney(item.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between gap-3 border-t border-border pt-2 text-sm font-semibold tabular-nums">
              <span>Approved total with VAT</span>
              <span>{formatMoney(approval.approvedTotal)}</span>
            </p>
          </div>
        ))}
      </div>
      {changed && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          Revision {changed.version} changed after the phone approval, so it cannot be signed here. Ask the service manager to review the estimate.
        </p>
      )}
      {editable ? (
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm font-medium">
            <FileSignature className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {PHONE_APPROVAL_STATEMENT}
          </p>
          <div>
            <label htmlFor={`${ids}-name`} className="text-sm font-semibold">
              Name of the person signing<span className="text-destructive" aria-hidden="true"> *</span>
            </label>
            <input
              id={`${ids}-name`}
              className={`${inputCls} mt-1`}
              value={name}
              maxLength={120}
              disabled={pending}
              aria-invalid={tried && !!nameProblem}
              aria-describedby={tried && nameProblem ? `${ids}-name-error` : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {tried && nameProblem && (
              <p id={`${ids}-name-error`} className="mt-1 text-sm text-destructive">
                {nameProblem}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">
              Customer&apos;s signature for the estimate<span className="text-destructive" aria-hidden="true"> *</span>
            </p>
            <SignaturePad label="Customer signs for the estimate approved by phone" onChange={setSignature} disabled={pending} />
            {tried && !signature && <p className="text-sm text-destructive">Ask the customer to sign in the box.</p>}
          </div>
          {failure && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {failure}
            </p>
          )}
          <div>
            <Button type="button" disabled={pending || !!changed} onClick={submit}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PenLine aria-hidden="true" />}
              {pending ? "Saving signature" : "Save estimate signature"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">The service advisor takes this signature at the counter.</p>
      )}
    </StageCard>
  );
}

/** "Customer signature": the delivery statement and the pad, signed by the person collecting. */
export function DeliverySignatureCard({
  signer,
  disabled,
  locked,
  padKey,
  onChange,
}: {
  signer: string | null;
  disabled: boolean;
  /** Why the pad is not offered yet, for example the estimate signature comes first. */
  locked: string | null;
  padKey: number;
  onChange: (image: string | null) => void;
}) {
  return (
    <StageCard title="Customer signature">
      <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm font-medium">
        <FileSignature className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {DELIVERY_STATEMENT}
      </p>
      {locked ? (
        <p className="text-sm text-muted-foreground">{locked}</p>
      ) : (
        <div className="space-y-1">
          <SignaturePad key={padKey} label="Customer signs to take delivery of the vehicle" onChange={onChange} disabled={disabled} />
          <p className="text-sm text-muted-foreground">{signer ? `Signing as ${signer}.` : "Choose who is collecting the vehicle, then ask them to sign."}</p>
        </div>
      )}
    </StageCard>
  );
}
