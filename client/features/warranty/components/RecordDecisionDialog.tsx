"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import { cn } from "@/lib/utils";
import { useTransitionWarrantyCase, useWarrantyCodes } from "../hooks/use-warranty";
import { fmtNaira } from "../lib/warranty-format";
import type { WarrantyCase } from "../types/warranty.types";

type Decision = "APPROVE" | "PARTIALLY_APPROVE" | "REJECT";

const today = () => new Date().toISOString().slice(0, 10);

/** Screen 07 — record the manufacturer's decision with an approval % per line. */
export function RecordDecisionDialog({ warrantyCase, initial = "APPROVE", onClose }: { warrantyCase: WarrantyCase; initial?: Decision; onClose: () => void }) {
  const transition = useTransitionWarrantyCase(warrantyCase.id);
  const { data: codes } = useWarrantyCodes();
  const [decision, setDecision] = useState<Decision>(initial);
  const [decisionAt, setDecisionAt] = useState(today());
  const [remarks, setRemarks] = useState("");
  const [rejectReasonId, setRejectReasonId] = useState("");
  const [percents, setPercents] = useState<Record<string, string>>(() =>
    Object.fromEntries(warrantyCase.lines.map((l) => [l.id, String(l.approvalPercent ?? 100)])),
  );

  const rows = useMemo(
    () =>
      warrantyCase.lines.map((l) => {
        const pct = decision === "APPROVE" ? 100 : decision === "REJECT" ? 0 : Number(percents[l.id]);
        const valid = Number.isFinite(pct) && pct >= 0 && pct <= 100;
        return { line: l, pct, valid, approved: valid ? Math.round(l.claimedAmount * pct) / 100 : 0 };
      }),
    [warrantyCase.lines, decision, percents],
  );
  const claimed = warrantyCase.claimedAmount;
  const approved = rows.reduce((s, r) => s + r.approved, 0);
  const allValid = rows.every((r) => r.valid);
  const partialOk = decision !== "PARTIALLY_APPROVE" || (rows.some((r) => r.pct < 100) && rows.some((r) => r.pct > 0));
  const canSave = allValid && partialOk && (decision !== "REJECT" || Boolean(rejectReasonId)) && Boolean(decisionAt);

  function save() {
    transition.mutate(
      {
        action: decision,
        decisionAt,
        remarks: remarks.trim() || null,
        ...(decision === "REJECT" && { rejectReasonId }),
        ...(decision === "PARTIALLY_APPROVE" && { lineApprovals: rows.map((r) => ({ lineId: r.line.id, approvalPercent: r.pct })) }),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalFame isOpen onClose={onClose} title="Record manufacturer decision">
      <div className="grid gap-5">
        <div className="grid grid-cols-3 rounded-lg border border-slate-200 p-1" role="radiogroup">
          {(
            [
              ["APPROVE", "Approved"],
              ["PARTIALLY_APPROVE", "Partially approved"],
              ["REJECT", "Rejected"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={decision === value}
              onClick={() => setDecision(value)}
              className={cn("rounded-md py-2 text-sm font-medium", decision === value ? "bg-primary text-primary-foreground" : "text-slate-600 hover:bg-slate-50")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-w-56">
          <Field label="Decision date">
            <DateInput value={decisionAt} onChange={setDecisionAt} />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Claim lines</p>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Seq</th>
                  <th className="px-3 py-2 text-left font-medium">Part / operation</th>
                  <th className="px-3 py-2 text-right font-medium">Claimed (₦)</th>
                  <th className="px-3 py-2 text-left font-medium">Approval %</th>
                  <th className="px-3 py-2 text-right font-medium">Approved (₦)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ line, pct, valid, approved: amt }, i) => (
                  <tr key={line.id} className={cn(decision === "PARTIALLY_APPROVE" && pct < 100 && "bg-amber-50")}>
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2">
                      <p className="font-mono text-xs">{line.partNumber ?? line.operationCode ?? "—"}</p>
                      <p className="text-xs text-slate-500">
                        {line.description}
                        {line.kind === "LABOUR" && " (labour)"}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right">{fmtNaira(line.claimedAmount)}</td>
                    <td className="px-3 py-2">
                      <div className="flex w-28 items-center rounded-md border border-slate-200 bg-white">
                        <input
                          aria-label={`Approval % for line ${i + 1}`}
                          className={cn("h-9 w-full rounded-l-md px-2 text-sm outline-none", !valid && "text-red-600")}
                          inputMode="decimal"
                          disabled={decision !== "PARTIALLY_APPROVE"}
                          value={decision === "PARTIALLY_APPROVE" ? percents[line.id] : String(pct)}
                          onChange={(e) => setPercents((p) => ({ ...p, [line.id]: e.target.value }))}
                        />
                        <span className="border-l border-slate-200 px-2 text-slate-400">%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{fmtNaira(amt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-center gap-8 rounded-lg bg-slate-50 p-4 text-center">
          <div>
            <p className="text-xs text-slate-500">Claimed total</p>
            <p className="text-lg font-bold">{fmtNaira(claimed)}</p>
          </div>
          <ArrowRight className="size-5 text-slate-400" />
          <div>
            <p className="text-xs text-slate-500">Approved total</p>
            <p className="text-lg font-bold">
              {fmtNaira(approved)} <span className="text-sm font-normal text-slate-500">({claimed > 0 ? ((approved / claimed) * 100).toFixed(1) : 0}%)</span>
            </p>
          </div>
        </div>
        {!partialOk && <p className="-mt-2 text-sm text-amber-700">A partial approval needs at least one line below 100% and something approved.</p>}

        <Field label="Remarks">
          <textarea className={cn(inputCls, "h-20 py-2")} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          <span className="text-right text-xs text-slate-400">{remarks.length}/500</span>
        </Field>

        <details className="rounded-lg border border-slate-200 bg-slate-50 p-3" open={decision === "REJECT"}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
            <ChevronDown className="size-4" /> If rejected
          </summary>
          <div className="mt-3">
            <Field label="Reject reason">
              <select className={inputCls} value={rejectReasonId} onChange={(e) => setRejectReasonId(e.target.value)} disabled={decision !== "REJECT"}>
                <option value="">Select a reason code</option>
                {codes?.reject.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.description}
                  </option>
                ))}
              </select>
            </Field>
            <p className="mt-1 text-xs text-slate-500">Rejecting requires a reason code.</p>
          </div>
        </details>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!canSave || transition.isPending}>
            {transition.isPending ? "Saving…" : "Save decision"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
