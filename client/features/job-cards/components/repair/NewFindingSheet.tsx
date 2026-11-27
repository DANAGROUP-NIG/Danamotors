"use client";
import { useId, useState } from "react";
import { Info, Loader2, Package, Plus, Send, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { useRaiseFinding } from "../../hooks/use-job-repair";
import { findingFormProblems, hasFindingProblems, type FindingForm } from "../../lib/repair.logic";

export const emptyFinding = (): FindingForm => ({ description: "", items: [] });

/**
 * "Need a part" and "Add a finding" during repair. The service advisor is told and prepares a
 * supplementary estimate; the work waits for the customer's approval. The form lives in the parent,
 * so choosing a part or work in the picker keeps everything typed.
 */
export function NewFindingSheet({
  jobCardId,
  kind,
  form,
  onChange,
  onPick,
  onClose,
}: {
  jobCardId: string;
  kind: "PART" | "FINDING";
  form: FindingForm;
  onChange: (form: FindingForm) => void;
  onPick: (kind: "LABOUR" | "PART") => void;
  onClose: () => void;
}) {
  const raise = useRaiseFinding(jobCardId);
  const [requestId] = useState(() => crypto.randomUUID());
  // After the first try, the messages follow the form, so a fixed mistake clears at once.
  const [tried, setTried] = useState(false);
  const problems = tried ? findingFormProblems(form, kind) : null;
  const [failure, setFailure] = useState<string | null>(null);
  const ids = useId();
  const busy = raise.isPending;
  const title = kind === "PART" ? "Need a part" : "Add a finding";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (hasFindingProblems(findingFormProblems(form, kind))) return;
    setFailure(null);
    raise
      .mutateAsync({
        requestId,
        kind,
        description: form.description.trim(),
        items: form.items.map((item) => ({ kind: item.kind, referenceId: item.referenceId, quantity: Number(item.quantity) })),
      })
      .then((step) => {
        toast.success(`Sent to ${step.serviceAdvisor ?? "the service advisor"} for a supplementary estimate`);
        onClose();
      })
      .catch((error: unknown) => setFailure(apiErrorMessage(error, "The finding was not sent. Everything you typed is still here. Check your connection and press Send to service advisor again.")));
  }

  const setItem = (index: number, quantity: string) => onChange({ ...form, items: form.items.map((item, at) => (at === index ? { ...item, quantity } : item)) });
  const removeItem = (index: number) => onChange({ ...form, items: form.items.filter((_item, at) => at !== index) });

  return (
    <ModalFame isOpen onClose={busy ? () => undefined : onClose} title={title} description="The service advisor prepares a supplementary estimate for the customer." placement="sheet" preventAccidentalClose>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Do not do this work until the customer approves it. Work already approved continues.
        </p>
        <div>
          <label htmlFor={`${ids}-description`} className="text-sm font-medium">
            {kind === "PART" ? "Why is the part needed?" : "What did you find?"}
            <span className="text-destructive" aria-hidden="true"> *</span>
          </label>
          <textarea
            id={`${ids}-description`}
            className={`${inputCls} mt-1 h-auto min-h-24 py-2`}
            required
            maxLength={1000}
            value={form.description}
            aria-invalid={!!problems?.description}
            aria-describedby={problems?.description ? `${ids}-description-error` : undefined}
            onChange={(event) => onChange({ ...form, description: event.target.value })}
            disabled={busy}
          />
          {problems?.description && (
            <p id={`${ids}-description-error`} className="mt-1 text-sm text-destructive">
              {problems.description}
            </p>
          )}
        </div>

        <fieldset className="space-y-2" disabled={busy} aria-describedby={problems?.items ? `${ids}-items-error` : undefined}>
          <legend className="text-sm font-medium">{kind === "PART" ? "Part needed" : "Work and parts needed"}</legend>
          {form.items.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {form.items.map((item, index) => (
                <li key={item.referenceId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  {item.kind === "LABOUR" ? <Wrench className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 break-words text-sm font-medium">{item.description}</span>
                  {item.kind === "PART" && (
                    <div className="flex items-center gap-2">
                      <label htmlFor={`${ids}-qty-${index}`} className="text-sm text-muted-foreground">
                        Quantity
                      </label>
                      <input
                        id={`${ids}-qty-${index}`}
                        inputMode="decimal"
                        className={`${inputCls} w-20 text-right tabular-nums`}
                        value={item.quantity}
                        aria-invalid={!!problems?.quantities[index]}
                        aria-describedby={problems?.quantities[index] ? `${ids}-qty-${index}-error` : undefined}
                        onChange={(event) => setItem(index, event.target.value)}
                      />
                    </div>
                  )}
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.description}`} title={`Remove ${item.description}`} onClick={() => removeItem(index)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                  {problems?.quantities[index] && (
                    <p id={`${ids}-qty-${index}-error`} className="basis-full text-sm text-destructive">
                      {problems.quantities[index]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onPick("PART")}>
              <Plus aria-hidden="true" />
              {form.items.some((item) => item.kind === "PART") ? "Add another part" : "Choose a part"}
            </Button>
            {kind === "FINDING" && (
              <Button type="button" variant="outline" onClick={() => onPick("LABOUR")}>
                <Plus aria-hidden="true" />
                Add work
              </Button>
            )}
          </div>
          {problems?.items && (
            <p id={`${ids}-items-error`} className="text-sm text-destructive">
              {problems.items}
            </p>
          )}
        </fieldset>

        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
            {busy ? "Sending" : "Send to service advisor"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}
