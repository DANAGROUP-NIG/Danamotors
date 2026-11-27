"use client";
import { useId, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { formatMoney } from "@/lib/format";
import { usePhoneApproval } from "../../hooks/use-job-estimate";
import { dateToLagosLocal, lagosLocalToDate, phoneFormProblems, type PhoneForm } from "../../lib/estimate.logic";
import type { EstimateRevision } from "../../types/job-estimate.types";

/**
 * The customer approved on the phone. The advisor records who, which number, when and which items.
 * It closes only on Cancel, the close icon or a successful save; the customer signs at delivery.
 */
export function PhoneApprovalDialog({
  jobCardId,
  jobNumber,
  customerName,
  estimate,
  open,
  onClose,
}: {
  jobCardId: string;
  jobNumber: string;
  customerName: string | null;
  estimate: EstimateRevision;
  open: boolean;
  onClose: () => void;
}) {
  const save = usePhoneApproval(jobCardId);
  const customerLines = estimate.lines.filter((line) => line.payer === "CUSTOMER");
  const [form, setForm] = useState<PhoneForm>(() => ({
    approverName: customerName ?? "",
    approverPhone: "",
    approvedAt: dateToLagosLocal(new Date()),
    approvedLineIds: customerLines.map((line) => line.id),
    note: "",
  }));
  const [errors, setErrors] = useState<ReturnType<typeof phoneFormProblems>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const ids = useId();
  const set = <K extends keyof PhoneForm>(key: K, value: PhoneForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const busy = save.isPending;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problems = phoneFormProblems(form, new Date(), estimate.createdAt);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setFailure(null);
    save
      .mutateAsync({
        estimateId: estimate.id,
        expectedHash: estimate.contentHash,
        approverName: form.approverName.trim(),
        approverPhone: form.approverPhone.trim(),
        approvedAt: lagosLocalToDate(form.approvedAt).toISOString(),
        approvedLineIds: form.approvedLineIds,
        note: form.note.trim() || undefined,
        requestId,
      })
      .then(() => {
        toast.success(`Phone approval saved for job ${jobNumber}. The customer signs at delivery.`);
        onClose();
      })
      .catch((error: unknown) => setFailure(apiErrorMessage(error, "The phone approval was not saved. Check your connection and press Save phone approval again.")));
  }

  const field = (key: keyof PhoneForm) => ({ id: `${ids}-${key}`, "aria-invalid": !!errors[key], "aria-describedby": errors[key] ? `${ids}-${key}-error` : undefined });
  const error = (key: keyof PhoneForm) =>
    errors[key] ? (
      <p id={`${ids}-${key}-error`} className="mt-1 text-sm text-destructive">
        {errors[key]}
      </p>
    ) : null;

  return (
    <ModalFame isOpen={open} onClose={busy ? () => undefined : onClose} title="Record phone approval" description="Record the customer's approval over the phone." preventAccidentalClose>
      <form onSubmit={submit} noValidate className="space-y-4 px-5 py-5 sm:px-6">
        <p className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <Info className="size-4 shrink-0" aria-hidden="true" />
          The customer will sign at delivery.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${ids}-approverName`} className="text-sm font-medium">
              Approved by <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input {...field("approverName")} className={inputCls} maxLength={120} autoComplete="name" value={form.approverName} onChange={(event) => set("approverName", event.target.value)} />
            {error("approverName")}
          </div>
          <div>
            <label htmlFor={`${ids}-approverPhone`} className="text-sm font-medium">
              Phone number <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input {...field("approverPhone")} className={inputCls} type="tel" inputMode="tel" maxLength={20} autoComplete="tel" placeholder="0803 555 0142" value={form.approverPhone} onChange={(event) => set("approverPhone", event.target.value)} />
            {error("approverPhone")}
          </div>
        </div>
        <div>
          <label htmlFor={`${ids}-approvedAt`} className="text-sm font-medium">
            Date and time of the call <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <input {...field("approvedAt")} className={inputCls} type="datetime-local" value={form.approvedAt} onChange={(event) => set("approvedAt", event.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">Lagos time.</p>
          {error("approvedAt")}
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Items approved</legend>
          <p className="text-xs text-muted-foreground">Untick anything the customer declined. Declined items are kept as recommended work for the next visit.</p>
          {customerLines.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">There is nothing for the customer to pay on this estimate.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {customerLines.map((line) => (
                <li key={line.id}>
                  <label className="flex min-h-11 items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={form.approvedLineIds.includes(line.id)}
                      onChange={(event) =>
                        set("approvedLineIds", event.target.checked ? [...form.approvedLineIds, line.id] : form.approvedLineIds.filter((id) => id !== line.id))
                      }
                    />
                    <span className="min-w-0 flex-1 break-words">{line.description}</span>
                    <span className="tabular-nums">{formatMoney(line.amount)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <div>
          <label htmlFor={`${ids}-note`} className="text-sm font-medium">
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea {...field("note")} className={`${inputCls} min-h-20`} maxLength={1000} value={form.note} onChange={(event) => set("note", event.target.value)} />
          {error("note")}
        </div>
        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {busy ? "Saving phone approval" : "Save phone approval"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}
