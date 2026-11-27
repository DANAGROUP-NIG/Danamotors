"use client";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KIND_LABEL, estimateTitle, payerSections, quantityText } from "../../lib/estimate.logic";
import type { JobEstimateStep } from "../../types/job-estimate.types";
import { StageCard } from "../workspace/StageCard";

/** The estimate as it stands, read only: lines by payer with the customer's answers, totals and the approval. */
export function EstimateReadOnly({ step, compact = false }: { step: JobEstimateStep; compact?: boolean }) {
  const estimate = step.estimate;
  if (!estimate)
    return (
      <StageCard title="Estimate">
        <p className="text-sm text-muted-foreground">The service advisor has not prepared the estimate yet.</p>
      </StageCard>
    );
  const approval = estimate.approval;
  const decided = !!approval;
  return (
    <StageCard title={estimateTitle(estimate)} description={estimate.number ? `Estimate ${estimate.number}` : undefined}>
      {!compact &&
        payerSections(estimate.lines).map((section) => (
          <div key={section.payer} className="overflow-hidden rounded-lg border border-border">
            <h3 className="bg-muted/60 px-3 py-2 text-sm font-semibold">
              {section.title} <span className="font-normal text-muted-foreground">({section.lines.length} {section.lines.length === 1 ? "item" : "items"})</span>
            </h3>
            {section.lines.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No items.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th scope="col" className="px-3 py-2 font-medium">Description</th>
                      <th scope="col" className="px-3 py-2 font-medium">Type</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Qty or hours</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                      {decided && section.payer === "CUSTOMER" && <th scope="col" className="px-3 py-2 font-medium">Customer</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {section.lines.map((line) => (
                      <tr key={line.id} className={cn("border-b border-border last:border-0", line.customerDecision === "DECLINED" && "text-muted-foreground")}>
                        <td className="px-3 py-2">
                          <span className="block max-w-[22rem] truncate" title={line.description}>
                            {line.description}
                          </span>
                        </td>
                        <td className="px-3 py-2">{KIND_LABEL[line.kind]}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{quantityText(line)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.amount)}</td>
                        {decided && section.payer === "CUSTOMER" && (
                          <td className="px-3 py-2">
                            {line.customerDecision === "DECLINED" ? (
                              <StatusBadge status="Recommended, declined" tone="gray" className="text-xs normal-case" />
                            ) : (
                              <StatusBadge status="Approved" tone="emerald" className="text-xs normal-case" />
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3 rounded-lg bg-muted px-3 py-2">
          <dt>Customer total, with VAT</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(estimate.totals.customerTotal)}</dd>
        </div>
        {decided && (
          <div className="flex justify-between gap-3 rounded-lg bg-muted px-3 py-2">
            <dt>Approved by the customer</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(estimate.totals.approvedTotal)}</dd>
          </div>
        )}
        {Number(estimate.totals.otherPayerTotal) > 0 && (
          <div className="flex justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <dt>Warranty and other payers</dt>
            <dd className="tabular-nums">{formatMoney(estimate.totals.otherPayerTotal)}</dd>
          </div>
        )}
      </dl>
      {approval ? (
        <p className="text-sm">
          {approval.channel === "PHONE" ? (
            <>
              Approved by phone by {approval.approverName}, {approval.approverPhone}, {formatDateTime(approval.approvedAt)}. Recorded by {approval.recordedBy ?? "the service advisor"}.{" "}
              {approval.signatureDueAtDelivery && <StatusBadge status="Customer to sign at delivery" tone="amber" className="text-xs normal-case" />}
            </>
          ) : (
            <>
              {estimate.outcome === "ALL_DECLINED" ? "Declined" : "Approved"} and signed by {approval.signerName ?? "the customer"}
              {approval.relationship === "Representative" ? " (Representative)" : ""}, {formatDateTime(approval.signedAt ?? approval.decidedAt)}.
            </>
          )}
          {approval.note ? ` Note: ${approval.note}` : ""}
        </p>
      ) : estimate.presentedAt ? (
        <p className="text-sm text-muted-foreground">Presented to the customer {formatDateTime(estimate.presentedAt)}. Waiting for their answer.</p>
      ) : (
        <p className="text-sm text-muted-foreground">Draft. The service advisor has not presented it to the customer yet.</p>
      )}
    </StageCard>
  );
}
