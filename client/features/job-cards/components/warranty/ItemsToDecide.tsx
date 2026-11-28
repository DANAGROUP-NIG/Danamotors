"use client";
import { formatQuantity } from "@/lib/format";
import { useId } from "react";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { SegmentedControl } from "@/features/reports/components/SegmentedControl";
import { cn } from "@/lib/utils";
import {
  decidedCount,
  ITEM_KIND_LABELS,
  PAYER_LABELS,
  PAYER_TONES,
  PAYERS,
  payerBlock,
  REASON_HINT,
  REASON_LABEL,
  REASON_MAX,
} from "../../lib/warranty-check.logic";
import type { DecisionItem, FindingPayer, JobWarrantyCheck } from "../../types/job-warranty.types";
import { StageCard } from "../workspace/StageCard";

export type ItemSaveState = { kind: "saving" } | { kind: "failed"; message: string };

export interface DecisionControls {
  /** The payer shown for each item: the officer's latest choice, saved or not. */
  payerOf: (item: DecisionItem) => FindingPayer | null;
  campaignOf: (item: DecisionItem) => string | null;
  saveState: Record<string, ItemSaveState | undefined>;
  onDecide: (item: DecisionItem, payer: FindingPayer, campaignId?: string | null) => void;
  onRetry: (item: DecisionItem) => void;
}

export interface ReasonControls {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  status: "idle" | "saving" | "saved" | "failed";
  onRetry: () => void;
}

const SELECTED: Record<FindingPayer, string> = {
  WARRANTY: "bg-purple-700 text-white shadow-sm",
  GOODWILL: "bg-blue-700 text-white shadow-sm",
  CAMPAIGN: "bg-amber-600 text-white shadow-sm",
  CUSTOMER: "bg-primary text-primary-foreground shadow-sm",
};

function PayerControl({ item, check, controls, compact }: { item: DecisionItem; check: JobWarrantyCheck; controls: DecisionControls; compact?: boolean }) {
  const state = controls.saveState[item.id];
  const payer = controls.payerOf(item);
  const campaignId = controls.campaignOf(item);
  const selectId = useId();
  return (
    <div className="grid min-w-0 gap-1.5">
      <SegmentedControl
        label={`Who pays for ${item.description}`}
        value={payer}
        fullWidth={compact}
        // In the table the control keeps its natural width, so no choice is cut off.
        className={compact ? undefined : "w-max max-w-none"}
        choices={PAYERS.map((value) => {
          const hint = payerBlock(value, item, check);
          return { value, label: PAYER_LABELS[value], disabled: !!hint, hint: hint ?? undefined, selectedClassName: SELECTED[value] };
        })}
        onChange={(value) => controls.onDecide(item, value as FindingPayer)}
      />
      {payer === "CAMPAIGN" && check.campaigns.length > 1 && (
        <label htmlFor={selectId} className="grid gap-1 text-xs">
          <span className="font-semibold">Campaign that pays</span>
          <select
            id={selectId}
            className={cn(inputCls, "h-9")}
            value={campaignId ?? ""}
            onChange={(event) => controls.onDecide(item, "CAMPAIGN", event.target.value || null)}
          >
            <option value="">Choose the campaign</option>
            {check.campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.code}, {campaign.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {state?.kind === "saving" && (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Saving
        </span>
      )}
      {state?.kind === "failed" && (
        <span className="flex flex-wrap items-center gap-2 text-xs text-destructive" role="alert">
          Not saved. {state.message}
          <button type="button" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2" onClick={() => controls.onRetry(item)}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Retry
          </button>
        </span>
      )}
    </div>
  );
}

function ReadOnlyPayer({ item }: { item: DecisionItem }) {
  if (!item.payer) return <span className="text-sm text-muted-foreground">Not decided</span>;
  return <StatusBadge status={PAYER_LABELS[item.payer]} tone={PAYER_TONES[item.payer]} className="text-xs normal-case" />;
}

function ItemName({ item }: { item: DecisionItem }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <span className="break-words font-semibold">
        {item.description}
        {item.quantity !== 1 && <span className="font-normal text-muted-foreground">, quantity {formatQuantity(item.quantity)}</span>}
      </span>
      <span className="text-xs text-muted-foreground">{item.request ? `For: ${item.request}` : "Not mentioned by the customer"}</span>
      {item.possibleWarranty && (
        <span>
          <StatusBadge status="Possible warranty" tone="purple" className="px-2 text-xs normal-case" />
        </span>
      )}
    </div>
  );
}

const KindBadge = ({ item }: { item: DecisionItem }) => (
  <StatusBadge status={ITEM_KIND_LABELS[item.kind]} tone="blue" className="px-2 text-xs normal-case" />
);

/** The diagnosed items with who pays for each, and the reason when the service history is not regular. */
export function ItemsToDecide({
  check,
  editable,
  controls,
  reason,
}: {
  check: JobWarrantyCheck;
  editable: boolean;
  controls: DecisionControls;
  reason: ReasonControls | null;
}) {
  const reasonId = useId();
  const hintId = useId();
  const errorId = useId();
  const count = decidedCount(check.items.map((item) => ({ payer: controls.payerOf(item) })));
  const showReason = check.history?.verdict.kind === "IRREGULAR" || !!check.reason;
  const reasonMissing = check.reasonNeeded && !(reason?.value ?? check.reason ?? "").trim();
  const highlighted = (item: DecisionItem) => controls.payerOf(item) === "WARRANTY";

  return (
    <StageCard
      title="Items to decide"
      description="Confirm who pays for each item based on the diagnosis, coverage and service history."
      actions={check.items.length ? <span className="text-sm tabular-nums text-muted-foreground">{count.label}</span> : undefined}
    >
      {check.items.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
          The technician listed no work or parts on this job, so there is nothing to decide. Return it to the service advisor.
        </p>
      ) : (
        <>
          {/* Wide screens: a table, as in the design. */}
          <div className="hidden xl:block">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-muted-foreground">
                  <th scope="col" className="border-b border-border px-3 py-2">Item</th>
                  <th scope="col" className="border-b border-border px-3 py-2">Type</th>
                  <th scope="col" className="border-b border-border px-3 py-2">Technician&apos;s note</th>
                  <th scope="col" className="w-[1%] whitespace-nowrap border-b border-border px-3 py-2">Decision</th>
                </tr>
              </thead>
              <tbody>
                {check.items.map((item) => (
                  <tr key={item.id} className={cn(highlighted(item) && "bg-purple-50/60")}>
                    <td className="border-b border-border px-3 py-2.5 align-top">
                      <ItemName item={item} />
                    </td>
                    <td className="border-b border-border px-3 py-2.5 align-top">
                      <KindBadge item={item} />
                    </td>
                    <td className="border-b border-border px-3 py-2.5 align-top">
                      <span className="line-clamp-3 break-words" title={item.technicianNote}>
                        {item.technicianNote}
                      </span>
                    </td>
                    {/* Sized to the payer control so it never scrolls; the note column takes the rest. */}
                    <td className="w-[1%] whitespace-nowrap border-b border-border px-3 py-2.5 align-top">
                      {editable ? <PayerControl item={item} check={check} controls={controls} /> : <ReadOnlyPayer item={item} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tablets and phones: one card per item. */}
          <ul className="grid gap-3 xl:hidden">
            {check.items.map((item) => (
              <li key={item.id} className={cn("grid gap-2 rounded-lg border border-border p-3 text-sm", highlighted(item) && "border-purple-200 bg-purple-50/60")}>
                <div className="flex items-start justify-between gap-2">
                  <ItemName item={item} />
                  <KindBadge item={item} />
                </div>
                <p className="break-words text-muted-foreground">
                  <span className="sr-only">Technician&apos;s note: </span>
                  {item.technicianNote}
                </p>
                {editable ? <PayerControl item={item} check={check} controls={controls} compact /> : <ReadOnlyPayer item={item} />}
              </li>
            ))}
          </ul>
        </>
      )}

      {showReason && (
        <div className="grid gap-1.5 border-t border-border pt-4">
          <label htmlFor={reasonId} className="text-sm font-semibold">
            {REASON_LABEL}
            {check.reasonNeeded && (
              <span className="text-red-500" aria-hidden="true">
                {" "}
                *
              </span>
            )}
          </label>
          <span id={hintId} className="text-xs text-muted-foreground">
            {REASON_HINT}
          </span>
          {editable && reason ? (
            <>
              <textarea
                id={reasonId}
                className={cn(inputCls, "h-24 py-2")}
                value={reason.value}
                maxLength={REASON_MAX}
                required={check.reasonNeeded}
                aria-invalid={reasonMissing}
                aria-describedby={reasonMissing ? `${hintId} ${errorId}` : hintId}
                onChange={(event) => reason.onChange(event.target.value)}
                onBlur={reason.onBlur}
              />
              {reasonMissing && (
                <span id={errorId} className="flex items-center gap-1.5 text-sm text-destructive">
                  <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
                  Write a reason, because the service history is not regular and items are set to warranty or goodwill.
                </span>
              )}
              <ReasonStatus reason={reason} />
            </>
          ) : (
            <p id={reasonId} className="whitespace-pre-wrap break-words text-sm">
              {check.reason ?? "No reason written."}
            </p>
          )}
        </div>
      )}
    </StageCard>
  );
}

function ReasonStatus({ reason }: { reason: ReasonControls }) {
  if (reason.status === "saving")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Saving reason
      </span>
    );
  if (reason.status === "saved")
    return (
      <span className="text-xs text-muted-foreground" role="status">
        Reason saved
      </span>
    );
  if (reason.status === "failed")
    return (
      <span className="flex flex-wrap items-center gap-2 text-xs text-destructive" role="alert">
        Reason not saved. Check your connection.
        <Button type="button" variant="outline" size="sm" onClick={reason.onRetry}>
          <RefreshCw aria-hidden="true" />
          Retry
        </Button>
      </span>
    );
  return null;
}
