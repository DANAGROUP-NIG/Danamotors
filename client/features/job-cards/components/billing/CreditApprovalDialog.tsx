"use client";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeCheck, Loader2 } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { formatMoney } from "@/lib/format";
import { creditApprovalSchema, type CreditApprovalValues } from "../../schemas/workshop-actions.schema";
import { useApproveCredit } from "../../hooks/use-job-billing";

/**
 * Delivery on credit: the vehicle may go before the balance is paid. For customers with agreed credit
 * terms; the reason is kept in the audit trail and the screen names who approved it.
 */
export function CreditApprovalDialog({
  job,
  balanceDue,
  onClose,
}: {
  job: { id: string; jobNumber: string };
  balanceDue: string | null;
  onClose: () => void;
}) {
  const ids = useId();
  const approve = useApproveCredit(job.id, job.jobNumber);
  const form = useForm<CreditApprovalValues>({ resolver: zodResolver(creditApprovalSchema), defaultValues: { remarks: "" } });
  const error = form.formState.errors.remarks?.message;
  const pending = approve.isPending;
  return (
    <ModalFame
      isOpen
      onClose={pending ? () => undefined : onClose}
      title="Approve delivery on credit"
      description={`Job ${job.jobNumber} can go to delivery before ${balanceDue ? `the balance of ${formatMoney(balanceDue)} is` : "it is"} paid. Approve only for customers with agreed credit terms.`}
      preventAccidentalClose
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) => {
          if (!pending) approve.mutate(values.remarks.trim(), { onSuccess: onClose });
        })}
      >
        <div>
          <label htmlFor={`${ids}-remarks`} className="text-sm font-semibold">
            Reason for credit approval<span className="text-destructive" aria-hidden="true"> *</span>
          </label>
          <textarea
            id={`${ids}-remarks`}
            className={`${inputCls} mt-1 h-24 py-2`}
            maxLength={2000}
            disabled={pending}
            aria-invalid={!!error}
            aria-describedby={`${ids}-help${error ? ` ${ids}-error` : ""}`}
            {...form.register("remarks")}
          />
          <p id={`${ids}-help`} className="mt-1 text-sm text-muted-foreground">
            For example, the fleet account and its credit terms. Kept in the audit trail.
          </p>
          {error && (
            <p id={`${ids}-error`} className="mt-1 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        {approve.isError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {apiErrorMessage(approve.error, "Credit could not be approved. Check your connection and try again.")}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <BadgeCheck aria-hidden="true" />}
            {pending ? "Approving" : "Approve delivery on credit"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}
