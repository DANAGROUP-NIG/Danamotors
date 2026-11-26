"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Loader2 } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import { cn } from "@/lib/utils";
import { useTransitionWarrantyCase, useWarrantyCodes } from "../hooks/use-warranty";
import { type Decision, decisionRows, initialAmounts, lineApprovalsPayload, summarizeDecision } from "../lib/decision.logic";
import { NOT_AVAILABLE, fmtNaira, todayInLagos } from "../lib/warranty-format";
import type { WarrantyCase } from "../types/warranty.types";

const DECISIONS: [Decision, string][] = [
  ["APPROVE", "Approved"],
  ["PARTIALLY_APPROVE", "Partially approved"],
  ["REJECT", "Rejected"],
];

/**
 * Screen 07: record the manufacturer's decision. For a partial approval the officer types
 * each line's approved amount exactly as the Kia portal shows it; the percentage is derived.
 */
export function RecordDecisionDialog({ warrantyCase, initial = "APPROVE", onClose }: { warrantyCase: WarrantyCase; initial?: Decision; onClose: () => void }) {
  const transition = useTransitionWarrantyCase(warrantyCase.id);
  const { data: codes } = useWarrantyCodes();
  const [decision, setDecision] = useState<Decision>(initial);
  const [decisionAt, setDecisionAt] = useState(todayInLagos());
  const [remarks, setRemarks] = useState("");
  const [rejectReasonId, setRejectReasonId] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>(() => initialAmounts(warrantyCase.lines));
  const [attempted, setAttempted] = useState(false);

  const rows = useMemo(() => decisionRows(warrantyCase.lines, decision, amounts), [warrantyCase.lines, decision, amounts]);
  const summary = summarizeDecision(rows, decision);
  const rowErrors = rows.filter((r) => r.error);
  const reasonError = decision === "REJECT" && !rejectReasonId ? "Choose the reject reason code from the Kia portal" : undefined;
  const dateError = decisionAt ? undefined : "Enter the decision date as dd/mm/yyyy";
  const canSave = rowErrors.length === 0 && !summary.error && !reasonError && !dateError;
  const editing = decision === "PARTIALLY_APPROVE";

  function save() {
    setAttempted(true);
    if (!canSave || transition.isPending) return;
    transition.mutate(
      {
        action: decision,
        decisionAt,
        remarks: remarks.trim() || null,
        ...(decision === "REJECT" && { rejectReasonId }),
        ...(editing && { lineApprovals: lineApprovalsPayload(rows) }),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalFame isOpen onClose={onClose} title="Record manufacturer decision" size="wide" preventAccidentalClose>
      <div className="grid gap-5">
        <div className="grid grid-cols-1 rounded-lg border border-slate-200 p-1 sm:grid-cols-3" role="radiogroup" aria-label="Decision">
          {DECISIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={decision === value}
              onClick={() => setDecision(value)}
              className={cn(
                "rounded-md py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                decision === value ? "bg-primary text-primary-foreground" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-w-56">
          <Field label="Decision date" required error={attempted ? dateError : undefined}>
            <DateInput value={decisionAt} onChange={setDecisionAt} max={todayInLagos()} invalid={attempted && Boolean(dateError)} />
          </Field>
        </div>

        <div>
          <p className="text-sm font-semibold">Claim lines</p>
          <p className="mb-2 text-xs text-slate-500">
            {editing
              ? "Type the approved amount for each line exactly as it appears on the Kia portal."
              : decision === "APPROVE"
                ? "Every line is approved at its claimed amount."
                : "Nothing is approved on a rejected claim."}
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Seq</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Part / operation</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Claimed</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Approved on portal</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Approval %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => {
                  const line = warrantyCase.lines[i];
                  const below = row.approvedAmount < row.claimedAmount;
                  const errorId = `decision-line-${line.id}-error`;
                  return (
                    <tr key={line.id} className={cn(editing && below && !row.error && "bg-amber-50")}>
                      <td className="px-3 py-2 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-mono text-xs">{line.partNumber ?? line.operationCode ?? NOT_AVAILABLE}</p>
                        <p className="text-xs text-slate-500">
                          {line.description}
                          {line.kind === "LABOUR" && " (labour)"}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(row.claimedAmount)}</td>
                      <td className="px-3 py-2 text-right">
                        {editing ? (
                          <div className="ml-auto grid w-40 gap-1">
                            <div className={cn("flex items-center rounded-md border bg-white focus-within:ring-2 focus-within:ring-ring", row.error && attempted ? "border-red-400" : "border-slate-200")}>
                              <span className="border-r border-slate-200 px-2 text-slate-500" aria-hidden="true">
                                ₦
                              </span>
                              <input
                                aria-label={`Approved amount on the Kia portal for line ${i + 1}`}
                                aria-invalid={attempted && Boolean(row.error)}
                                aria-describedby={row.error && attempted ? errorId : undefined}
                                className="h-9 w-full min-w-0 rounded-r-md px-2 text-right text-sm tabular-nums outline-none"
                                inputMode="decimal"
                                value={amounts[line.id] ?? ""}
                                onChange={(e) => setAmounts((a) => ({ ...a, [line.id]: e.target.value }))}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="font-semibold tabular-nums">{fmtNaira(row.approvedAmount)}</span>
                        )}
                        {attempted && row.error && (
                          <p id={errorId} className="mt-1 text-left text-xs text-red-600">
                            {row.error}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.error ? NOT_AVAILABLE : `${row.approvalPercent.toFixed(2)}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-slate-50 p-4 text-center sm:flex-row sm:gap-8">
          <div>
            <p className="text-xs text-slate-500">Claimed total</p>
            <p className="text-lg font-bold tabular-nums">{fmtNaira(summary.claimedTotal)}</p>
          </div>
          <ArrowRight className="hidden size-5 text-slate-400 sm:block" aria-hidden="true" />
          <div>
            <p className="text-xs text-slate-500">Approved total</p>
            <p className="text-lg font-bold tabular-nums">
              {fmtNaira(summary.approvedTotal)} <span className="text-sm font-normal text-slate-500">({summary.approvedPercent.toFixed(1)}%)</span>
            </p>
          </div>
        </div>
        {summary.error && (
          <p role="alert" className="-mt-2 text-sm text-amber-700">
            {summary.error}
          </p>
        )}

        <Field label="Remarks">
          <textarea className={cn(inputCls, "h-20 py-2")} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          <span className="text-right text-xs text-slate-500">{remarks.length}/500</span>
        </Field>

        <details className="rounded-lg border border-slate-200 bg-slate-50 p-3" open={decision === "REJECT"}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
            <ChevronDown className="size-4" aria-hidden="true" /> If rejected
          </summary>
          <div className="mt-3">
            <Field label="Reject reason" required={decision === "REJECT"} error={attempted ? reasonError : undefined}>
              <select className={inputCls} value={rejectReasonId} onChange={(e) => setRejectReasonId(e.target.value)} disabled={decision !== "REJECT"}>
                <option value="">Select a reason code</option>
                {codes?.reject.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.description}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </details>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={onClose} disabled={transition.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={transition.isPending || (attempted && !canSave)}>
            {transition.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {transition.isPending ? "Saving decision" : "Save decision"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
