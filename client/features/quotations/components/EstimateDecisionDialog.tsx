"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { cancelEstimateRequest, recordEstimateDecisionRequest } from "../api/quotation.api";
import { quotationKeys } from "../api/quotation.keys";
import type { Quotation } from "../types/quotation.types";

export type EstimateAction = { kind: "decision" | "cancel"; quotation: Quotation } | null;

function apiMessage(error: unknown, fallback: string) {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/** Record the customer's decision on, or cancel, an estimate prepared before a job. */
export function EstimateDecisionDialog({ action, onClose }: { action: EstimateAction; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [comments, setComments] = useState("");
  const [reason, setReason] = useState("");
  const done = async (message: string) => {
    toast.success(message);
    await queryClient.invalidateQueries({ queryKey: quotationKeys.all });
    setComments("");
    setReason("");
    onClose();
  };
  const decide = useMutation({
    mutationFn: (approved: boolean) =>
      recordEstimateDecisionRequest(action!.quotation.id, { customerId: action!.quotation.customer!.id, approved, comments: comments.trim() || undefined }),
    onSuccess: (_data, approved) => done(approved ? "Estimate approved" : "Estimate declined"),
    onError: (error) => toast.error(apiMessage(error, "The decision could not be recorded")),
  });
  const cancel = useMutation({
    mutationFn: () => cancelEstimateRequest(action!.quotation.id, reason.trim()),
    onSuccess: () => done("Estimate cancelled"),
    onError: (error) => toast.error(apiMessage(error, "The estimate could not be cancelled")),
  });
  const busy = decide.isPending || cancel.isPending;
  const quotation = action?.quotation;

  return (
    <ModalFame
      isOpen={Boolean(action)}
      onClose={() => !busy && onClose()}
      title={action?.kind === "cancel" ? `Cancel estimate ${quotation?.estimateNumber ?? ""}` : `Customer decision on ${quotation?.estimateNumber ?? "estimate"}`}
    >
      {action?.kind === "cancel" ? (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!reason.trim()) return toast.error("Give a reason for cancelling");
            cancel.mutate();
          }}
        >
          <Field label="Reason">
            <input className={inputCls} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Customer will not proceed" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Keep estimate</Button>
            <Button type="submit" variant="destructive" disabled={busy}>Cancel estimate</Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Record what {quotation?.customer ? `${quotation.customer.firstName} ${quotation.customer.lastName}` : "the customer"} decided. An approved estimate stays open until a job card is opened from it.
          </p>
          <Field label="Comments (optional)">
            <textarea className="min-h-16 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={comments} onChange={(event) => setComments(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => decide.mutate(false)}>Declined</Button>
            <Button type="button" disabled={busy} onClick={() => decide.mutate(true)}>Approved</Button>
          </div>
        </div>
      )}
    </ModalFame>
  );
}
