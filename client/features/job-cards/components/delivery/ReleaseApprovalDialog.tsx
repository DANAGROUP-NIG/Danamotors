"use client";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShieldAlert } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { RELEASE_RULE, releaseApprovalSchema, type ReleaseApprovalValues } from "../../lib/delivery.logic";

/**
 * A service or workshop manager approves releasing the vehicle to someone other than the owner or the person who
 * signed the job card. It closes only on Cancel, the close icon or success; the entries are kept on a failed save.
 */
export function ReleaseApprovalDialog({
  jobNumber,
  defaultName,
  pending,
  failure,
  onConfirm,
  onClose,
}: {
  jobNumber: string;
  defaultName: string;
  pending: boolean;
  failure: string | null;
  onConfirm: (values: ReleaseApprovalValues) => void;
  onClose: () => void;
}) {
  const ids = useId();
  const form = useForm<ReleaseApprovalValues>({
    resolver: zodResolver(releaseApprovalSchema),
    defaultValues: { collectorName: defaultName, collectorPhone: "", reason: "" },
  });
  const { errors } = form.formState;
  const field = (name: keyof ReleaseApprovalValues) => ({
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `${ids}-${name}-error` : undefined,
  });
  const error = (name: keyof ReleaseApprovalValues) =>
    errors[name] && (
      <p id={`${ids}-${name}-error`} className="mt-1 text-sm text-destructive">
        {errors[name]?.message}
      </p>
    );

  return (
    <ModalFame
      isOpen
      onClose={pending ? () => undefined : onClose}
      title="Approve release to someone else"
      description={`Job ${jobNumber}. Check the person's identity before you approve.`}
      preventAccidentalClose
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) => {
          if (!pending) onConfirm(values);
        })}
      >
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {RELEASE_RULE}
        </p>
        <fieldset disabled={pending} className="space-y-4">
          <div>
            <label htmlFor={`${ids}-collectorName`} className="text-sm font-semibold">
              Full name of the person collecting<span className="text-destructive" aria-hidden="true"> *</span>
            </label>
            <input id={`${ids}-collectorName`} className={`${inputCls} mt-1`} maxLength={120} {...field("collectorName")} {...form.register("collectorName")} />
            {error("collectorName")}
          </div>
          <div>
            <label htmlFor={`${ids}-collectorPhone`} className="text-sm font-semibold">
              Their phone number<span className="text-destructive" aria-hidden="true"> *</span>
            </label>
            <input
              id={`${ids}-collectorPhone`}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="0803 555 0142"
              className={`${inputCls} mt-1`}
              {...field("collectorPhone")}
              {...form.register("collectorPhone")}
            />
            {error("collectorPhone")}
          </div>
          <div>
            <label htmlFor={`${ids}-reason`} className="text-sm font-semibold">
              Reason<span className="text-destructive" aria-hidden="true"> *</span>
            </label>
            <textarea id={`${ids}-reason`} className={`${inputCls} mt-1 h-24 py-2`} maxLength={1000} {...field("reason")} {...form.register("reason")} />
            <p className="mt-1 text-sm text-muted-foreground">For example: the owner phoned to say her driver will collect, and he showed his ID.</p>
            {error("reason")}
          </div>
        </fieldset>
        {failure && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {failure}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {pending ? "Approving" : "Approve release"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}
