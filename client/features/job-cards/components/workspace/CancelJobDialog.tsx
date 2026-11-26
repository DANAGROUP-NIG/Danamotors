"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { cancelJobSchema, type CancelJobValues } from "../../schemas/cancel-job.schema";

/**
 * Confirms cancelling a job and asks why. It closes only on Keep job, the close button, or a
 * successful cancel, so a typed reason is never lost by a stray click.
 */
export function CancelJobDialog({
  open,
  jobNumber,
  plate,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  jobNumber: string;
  plate: string;
  pending: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const form = useForm<CancelJobValues>({ resolver: zodResolver(cancelJobSchema), defaultValues: { reason: "" } });
  const reason = form.watch("reason");
  const close = () => {
    if (pending) return;
    form.reset();
    onClose();
  };
  return (
    <ModalFame
      isOpen={open}
      onClose={close}
      preventAccidentalClose
      title={`Cancel job ${jobNumber}`}
      description={`${plate}. The job stops at its current step and no one can work on it after this.`}
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={form.handleSubmit((values) => {
          if (!pending) onConfirm(values.reason);
        })}
      >
        <Field label="Reason for cancelling" required error={form.formState.errors.reason?.message}>
          <textarea className={`${inputCls} h-28 py-2`} maxLength={2000} disabled={pending} autoFocus {...form.register("reason")} />
          <span className="text-xs text-muted-foreground">The reason is shown on the cancelled job and kept in the activity log.</span>
        </Field>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={pending}>
            Keep job
          </Button>
          <Button type="submit" variant="destructive" disabled={pending || !reason.trim()}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {pending ? "Cancelling job" : "Cancel job"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}
