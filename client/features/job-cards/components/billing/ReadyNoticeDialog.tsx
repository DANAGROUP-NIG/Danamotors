"use client";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Loader2, Phone, MessageSquare } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { NOT_PROVIDED } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CHANNEL_LABELS, readyNoticeSchema, type ReadyNoticeValues } from "../../lib/billing.logic";
import type { ReadyChannel } from "../../types/job-billing.types";

const ICONS: Record<ReadyChannel, typeof Phone> = { PHONE_CALL: Phone, SMS: MessageSquare };

/**
 * How the advisor told the customer the vehicle is ready: phone call or SMS, with an optional note.
 * Used to mark ready (the first notice) and for "Send again". There is no SMS link: SMS records that the
 * advisor sent one. It closes only on Cancel, the close icon or success; the entries are kept on a failed save.
 */
export function ReadyNoticeDialog({
  mode,
  phone,
  pending,
  failure,
  onConfirm,
  onClose,
}: {
  mode: "ready" | "again";
  phone: string | null;
  pending: boolean;
  failure: string | null;
  onConfirm: (values: ReadyNoticeValues) => void;
  onClose: () => void;
}) {
  const ids = useId();
  const form = useForm<ReadyNoticeValues>({
    resolver: zodResolver(readyNoticeSchema),
    defaultValues: { channel: undefined, note: "" },
  });
  const { errors } = form.formState;
  const channel = form.watch("channel");
  const ready = mode === "ready";

  return (
    <ModalFame
      isOpen
      onClose={pending ? () => undefined : onClose}
      title={ready ? "Mark ready and notify customer" : "Record another notice"}
      description={
        ready
          ? "The vehicle is marked ready for collection. Record how you told the customer: this starts the storage counter."
          : "Record that you told the customer again. The storage counter keeps the first notice."
      }
      preventAccidentalClose
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) => {
          if (!pending) onConfirm(values);
        })}
      >
        <fieldset aria-describedby={errors.channel ? `${ids}-channel-error` : undefined} disabled={pending}>
          <legend className="text-sm font-semibold">
            How did you tell the customer<span className="text-destructive" aria-hidden="true"> *</span>
          </legend>
          <p className="mt-1 text-sm text-muted-foreground">Customer phone: {phone?.trim() || NOT_PROVIDED}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(["PHONE_CALL", "SMS"] as const).map((value) => {
              const Icon = ICONS[value];
              return (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-ring",
                    channel === value ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <input type="radio" value={value} className="size-4" {...form.register("channel")} />
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {CHANNEL_LABELS[value]}
                </label>
              );
            })}
          </div>
          {errors.channel && (
            <p id={`${ids}-channel-error`} className="mt-1 text-sm text-destructive">
              {errors.channel.message}
            </p>
          )}
        </fieldset>
        {channel === "SMS" && (
          <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            The app does not send SMS yet. Send the message from the workshop phone, then record it here.
          </p>
        )}
        <div>
          <label htmlFor={`${ids}-note`} className="text-sm font-semibold">
            Note (optional)
          </label>
          <textarea
            id={`${ids}-note`}
            className={`${inputCls} mt-1 h-24 py-2`}
            maxLength={500}
            disabled={pending}
            aria-invalid={!!errors.note}
            aria-describedby={`${ids}-note-help${errors.note ? ` ${ids}-note-error` : ""}`}
            {...form.register("note")}
          />
          <p id={`${ids}-note-help`} className="mt-1 text-sm text-muted-foreground">
            For example, when the customer will collect.
          </p>
          {errors.note && (
            <p id={`${ids}-note-error`} className="mt-1 text-sm text-destructive">
              {errors.note.message}
            </p>
          )}
        </div>
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
            {pending ? "Saving" : ready ? "Mark ready and save notice" : "Save notice"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}
