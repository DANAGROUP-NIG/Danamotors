"use client";
import { useId, useState } from "react";
import { Info, Loader2, PenLine, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApproveEstimate } from "../../hooks/use-job-estimate";
import { customerGroups, initialDecisions, liveApproval, noChargeNote, signFormProblems, type SignForm } from "../../lib/estimate.logic";
import type { EstimateLine, JobEstimateStep, LineDecision } from "../../types/job-estimate.types";
import { SignaturePad } from "../SignaturePad";

/**
 * Customer-facing approval, for the tablet: plain words, prices for what the customer pays, an
 * Approve or Decline choice per item, a running total with VAT, and the signature.
 */
export function CustomerApproval({ step }: { step: JobEstimateStep & { estimate: NonNullable<JobEstimateStep["estimate"]> } }) {
  const { estimate } = step;
  const approve = useApproveEstimate(step.jobCardId);
  const [decisions, setDecisions] = useState<Record<string, LineDecision>>(() => initialDecisions(estimate.lines));
  const [form, setForm] = useState<SignForm>({ signer: "OWNER", name: "", phone: "", signature: null, accepted: false });
  const [errors, setErrors] = useState<ReturnType<typeof signFormProblems>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const live = liveApproval(estimate.lines, decisions, estimate.vatRate);
  const groups = customerGroups(estimate.lines, step.requests);
  const note = noChargeNote(estimate.lines);
  const busy = approve.isPending;
  const set = <K extends keyof SignForm>(key: K, value: SignForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  function submit() {
    if (busy) return;
    const problems = signFormProblems(form);
    setErrors(problems);
    if (Object.keys(problems).length || !form.signature) return;
    setFailure(null);
    approve
      .mutateAsync({
        estimateId: estimate.id,
        expectedHash: estimate.contentHash,
        decisions: Object.entries(decisions).map(([lineId, decision]) => ({ lineId, decision })),
        signer: form.signer,
        signerName: form.signer === "OWNER" ? (step.customerName ?? "Owner") : form.name.trim(),
        ...(form.signer === "REPRESENTATIVE" ? { signerPhone: form.phone.trim() } : {}),
        signatureImage: form.signature,
        consentAccepted: true,
        requestId,
      })
      .then((result) => {
        const outcome = result.estimate?.outcome;
        toast.success(
          outcome === "ALL_DECLINED"
            ? `The customer declined all work on job ${step.jobNumber}`
            : `Estimate approved and signed for job ${step.jobNumber}`,
        );
      })
      // Everything stays on screen, including the signature and choices, so it can be sent again.
      .catch((error: unknown) => setFailure(apiErrorMessage(error, "The approval was not saved. Check your connection and press Approve and sign again.")));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 text-base">
      <div>
        <h3 className="text-xl font-semibold">Your estimate for {step.registration ?? "your vehicle"}</h3>
        <p className="text-muted-foreground">Approve the work you want us to do. You can decline any item.</p>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4">There is nothing for you to pay on this estimate. Please sign to approve the work.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-label={group.title} className="overflow-hidden rounded-xl border border-border bg-card">
            <h4 className="flex items-center gap-3 border-b border-border px-4 py-3 font-semibold">
              {group.number !== null && (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-sm" aria-hidden="true">
                  {group.number}
                </span>
              )}
              <span className="min-w-0 break-words">{group.title}</span>
            </h4>
            <ul>
              {group.lines.map((line) => (
                <DecisionRow
                  key={line.id}
                  line={line}
                  decision={decisions[line.id] ?? "APPROVED"}
                  disabled={busy}
                  onChange={(decision) => setDecisions((current) => ({ ...current, [line.id]: decision }))}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {note && (
        <p className="flex items-start gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-purple-900">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          {note}
        </p>
      )}

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-900" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-lg font-semibold">You approve</span>
          <span className="text-2xl font-semibold tabular-nums">{formatMoney(live.total)}</span>
        </div>
        <p className="text-right text-sm">including VAT</p>
      </div>
      {live.declinedCount > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
          <Info className="size-4 shrink-0" aria-hidden="true" />
          Declined items will be reminded at your next visit.
        </p>
      )}

      <section aria-label="Who is signing" className="space-y-3 rounded-xl border border-border bg-card p-4">
        <fieldset disabled={busy} className="space-y-3">
          <legend className="font-semibold">Who is signing</legend>
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border">
            {(["OWNER", "REPRESENTATIVE"] as const).map((value, index) => (
              <label
                key={value}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center justify-center font-medium focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring",
                  index > 0 && "border-l border-border",
                  form.signer === value ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                )}
              >
                <input type="radio" name="estimate-signer" value={value} checked={form.signer === value} onChange={() => set("signer", value)} className="sr-only" />
                {value === "OWNER" ? "Owner" : "Representative"}
              </label>
            ))}
          </div>
          {form.signer === "OWNER" ? (
            <p>
              Signing as <span className="font-semibold">{step.customerName ?? "the owner"}</span>
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <SignerField label="Name" error={errors.name}>
                {(id, describedBy) => (
                  <input id={id} aria-describedby={describedBy} aria-invalid={!!errors.name} className={inputCls} maxLength={120} autoComplete="name" value={form.name} onChange={(event) => set("name", event.target.value)} />
                )}
              </SignerField>
              <SignerField label="Phone" error={errors.phone}>
                {(id, describedBy) => (
                  <input id={id} aria-describedby={describedBy} aria-invalid={!!errors.phone} className={inputCls} type="tel" inputMode="tel" maxLength={20} autoComplete="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} />
                )}
              </SignerField>
            </div>
          )}
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 accent-primary" checked={form.accepted} aria-invalid={!!errors.accepted} onChange={(event) => set("accepted", event.target.checked)} />
            I approve the work above at the prices shown and accept the estimate terms and conditions.
          </label>
          {errors.accepted && (
            <p role="alert" className="text-sm text-destructive">
              {errors.accepted}
            </p>
          )}
        </fieldset>
      </section>

      <section aria-label="Signature" className="space-y-2 rounded-xl border border-border bg-card p-4">
        <p className="font-semibold">
          Signature <span className="text-destructive" aria-hidden="true">*</span>
        </p>
        <SignaturePad label="Customer signature. Sign with a finger or stylus." onChange={(image) => set("signature", image)} disabled={busy} />
        {errors.signature && (
          <p role="alert" className="text-sm text-destructive">
            {errors.signature}
          </p>
        )}
      </section>

      {failure && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {failure}
        </p>
      )}
      <Button type="button" className="h-12 w-full text-base" disabled={busy} onClick={submit}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PenLine aria-hidden="true" />}
        {busy ? "Saving the approval" : "Approve and sign"}
      </Button>
    </div>
  );
}

function DecisionRow({ line, decision, disabled, onChange }: { line: EstimateLine; decision: LineDecision; disabled: boolean; onChange: (decision: LineDecision) => void }) {
  const approved = decision === "APPROVED";
  return (
    <li className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0", !approved && "text-muted-foreground")}>
      <span className="min-w-0 flex-1 break-words">{line.description}</span>
      <span className="tabular-nums">{formatMoney(line.amount)}</span>
      <div role="group" aria-label={`${line.description}: approve or decline`} className="grid grid-cols-2 overflow-hidden rounded-lg border border-border text-sm">
        {(["APPROVED", "DECLINED"] as const).map((value, index) => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-pressed={decision === value}
            onClick={() => onChange(value)}
            className={cn(
              "min-h-11 min-w-24 px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              index > 0 && "border-l border-border",
              decision === value ? (value === "APPROVED" ? "bg-emerald-600 text-white" : "bg-muted-foreground text-background") : "bg-card text-foreground hover:bg-muted",
            )}
          >
            {value === "APPROVED" ? "Approve" : "Decline"}
          </button>
        ))}
      </div>
    </li>
  );
}

function SignerField({ label, error, children }: { label: string; error?: string; children: (id: string, describedBy?: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label} <span className="text-destructive" aria-hidden="true">*</span>
      </label>
      {children(id, error ? `${id}-error` : undefined)}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
