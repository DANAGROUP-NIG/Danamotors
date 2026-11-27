"use client";
import { useId } from "react";
import { Warehouse } from "lucide-react";
import { inputCls } from "@/components/forms/FormField";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StorageDecisionValues } from "../../lib/billing.logic";

/**
 * Terms clause 3 at invoice time: the proposed storage charge, which the advisor accepts as a bill line
 * or removes with a reason (kept in the audit trail). It is never added or dropped without an answer.
 * Used by Create invoice on the job and by Billing, Create job bill.
 */
export function StorageChargeDecision({
  proposal,
  value,
  errors,
  disabled,
  onChange,
}: {
  proposal: { days: number; proposedAmount: string; dailyRate: string; freeUntil: string };
  value: Partial<StorageDecisionValues>;
  errors: { decision?: string; reason?: string };
  disabled: boolean;
  onChange: (value: Partial<StorageDecisionValues>) => void;
}) {
  const ids = useId();
  const days = `${proposal.days} ${proposal.days === 1 ? "day" : "days"}`;
  return (
    <fieldset className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3" disabled={disabled} aria-describedby={`${ids}-what`}>
      <legend className="sr-only">Storage charge</legend>
      <p id={`${ids}-what`} className="flex items-start gap-2 text-sm">
        <Warehouse className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          <span className="font-semibold">Storage charge proposed: {formatMoney(proposal.proposedAmount)}</span> ({days} at {formatMoney(proposal.dailyRate)}{" "}
          per day after {formatDateTime(proposal.freeUntil)}, terms clause 3).
        </span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["ACCEPT", "Add to the invoice"],
            ["REMOVE", "Remove, with a reason"],
          ] as const
        ).map(([decision, label]) => (
          <label
            key={decision}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-ring",
              value.decision === decision ? "border-primary" : "border-border",
            )}
          >
            <input
              type="radio"
              name={`${ids}-decision`}
              className="size-4"
              checked={value.decision === decision}
              onChange={() => onChange({ ...value, decision })}
            />
            {label}
          </label>
        ))}
      </div>
      {errors.decision && <p className="text-sm text-destructive">{errors.decision}</p>}
      {value.decision === "REMOVE" && (
        <div>
          <label htmlFor={`${ids}-reason`} className="text-sm font-semibold">
            Reason for removing the storage charge<span className="text-destructive" aria-hidden="true"> *</span>
          </label>
          <textarea
            id={`${ids}-reason`}
            className={`${inputCls} mt-1 h-20 py-2`}
            maxLength={500}
            value={value.reason ?? ""}
            aria-invalid={!!errors.reason}
            aria-describedby={errors.reason ? `${ids}-reason-error` : undefined}
            onChange={(event) => onChange({ ...value, reason: event.target.value })}
          />
          {errors.reason && (
            <p id={`${ids}-reason-error`} className="mt-1 text-sm text-destructive">
              {errors.reason}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
