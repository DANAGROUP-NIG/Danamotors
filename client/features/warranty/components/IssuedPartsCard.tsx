"use client";

import { PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ISSUED_PART_OUTCOME_LABELS,
  ISSUED_PART_OUTCOME_TONES,
  NOT_AVAILABLE,
  fmtNaira,
  fmtNairaSigned,
} from "../lib/warranty-format";
import type { IssuedPartsReconciliation } from "../types/warranty.types";
import { Pill, SectionCard, tdCls, thCls } from "./ui";

const money = (value: number | null) => (value == null ? <span className="text-slate-500">{NOT_AVAILABLE}</span> : fmtNaira(value));

/**
 * Parts issued from our store against the job card, set against what was claimed and what
 * Kia approved on the portal, with the shortfall per part and in total.
 */
export function IssuedPartsCard({ reconciliation, hasJobCard }: { reconciliation: IssuedPartsReconciliation; hasJobCard: boolean }) {
  const { rows, totals, decided } = reconciliation;
  const variance = totals.variance;

  return (
    <SectionCard
      icon={<PackageCheck />}
      title="Issued Parts vs Approved Claim"
      note={decided ? "Approved amounts as entered from the Kia portal." : "Approved amounts appear once the Kia decision is recorded."}
    >
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-slate-500">
          {hasJobCard
            ? "No warranty parts have been issued on the job card yet. Issued parts appear here once the store issues them against the requisition."
            : "This case is not linked to a job card, so there are no issued parts to compare."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full">
              <caption className="sr-only">Parts issued on the job card compared with the claimed and approved amounts</caption>
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th scope="col" className={thCls}>Part number</th>
                  <th scope="col" className={thCls}>Description</th>
                  <th scope="col" className={`${thCls} text-right`}>Issued qty</th>
                  <th scope="col" className={`${thCls} text-right`}>Issued amount</th>
                  <th scope="col" className={`${thCls} text-right`}>Claimed</th>
                  <th scope="col" className={`${thCls} text-right`}>Approved</th>
                  <th scope="col" className={`${thCls} text-right`}>Variance</th>
                  <th scope="col" className={thCls}>Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={`${r.jobCardLineId ?? "claim"}-${r.claimLineId ?? "issue"}`}>
                    <td className={`${tdCls} font-mono text-xs`}>{r.partNumber ?? NOT_AVAILABLE}</td>
                    <td className={cn(tdCls, "max-w-64")}>
                      <span className="block truncate" title={r.description}>
                        {r.description}
                      </span>
                    </td>
                    <td className={`${tdCls} text-right tabular-nums`}>{r.issuedQuantity}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{fmtNaira(r.issuedAmount)}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{money(r.claimedAmount)}</td>
                    <td className={`${tdCls} text-right tabular-nums font-medium`}>{money(r.approvedAmount)}</td>
                    <td className={cn(tdCls, "text-right tabular-nums", r.variance != null && r.variance < 0 && "font-semibold text-red-700")}>
                      {r.variance == null ? <span className="text-slate-500">{NOT_AVAILABLE}</span> : fmtNairaSigned(r.variance)}
                    </td>
                    <td className={tdCls}>
                      <Pill status={ISSUED_PART_OUTCOME_LABELS[r.outcome]} tone={ISSUED_PART_OUTCOME_TONES[r.outcome]} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50/60 text-sm font-semibold">
                <tr>
                  <th scope="row" colSpan={3} className="px-3 py-2 text-left">
                    Total
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(totals.issuedAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(totals.claimedAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(totals.approvedAmount)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", variance != null && variance < 0 && "text-red-700")}>
                    {variance == null ? <span className="text-slate-500">{NOT_AVAILABLE}</span> : fmtNairaSigned(variance)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {variance != null && variance < 0 && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              Kia approved {fmtNaira(Math.abs(variance))} less than the value of parts issued from our store for this job.
            </p>
          )}
          {rows.some((r) => r.outcome === "NOT_CLAIMED") && (
            <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
              Some issued warranty parts are not on the claim. Use Import job card lines while the case is editable, or explain the difference in the remarks.
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
}
