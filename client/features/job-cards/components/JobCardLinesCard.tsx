"use client";

import { useState } from "react";
import { Info, Lock, Wrench } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { JOBCARD_LINE_UPDATE, WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { Pill, SectionCard, tdCls, thCls } from "@/features/warranty/components/ui";
import { fmtNaira } from "@/features/warranty/lib/warranty-format";
import { cn } from "@/lib/utils";
import { useJobCardLines, useUpdateJobCardLine } from "../hooks/use-job-card-lines";
import type { ChargeType, JobCardLine, JobCardLines } from "../types/job-card-line.types";

const CHARGE_LABELS: Record<ChargeType, string> = {
  CUSTOMER: "Customer",
  WARRANTY: "Warranty",
  GOODWILL: "Goodwill",
  FREE: "Free – campaign",
};

const CHARGE_STYLES: Record<ChargeType, string> = {
  CUSTOMER: "border-slate-200 bg-slate-100 text-slate-700",
  WARRANTY: "border-emerald-200 bg-emerald-50 text-emerald-700",
  GOODWILL: "border-purple-200 bg-purple-50 text-purple-700",
  FREE: "border-blue-200 bg-blue-50 text-blue-700",
};

function defaultReason(line: JobCardLine) {
  if (line.chargeTypeChangedAt) {
    const by = line.chargeTypeChangedBy ? ` by ${line.chargeTypeChangedBy.firstName} ${line.chargeTypeChangedBy.lastName}` : "";
    return `Changed${by}${line.chargeTypeReason ? `: ${line.chargeTypeReason}` : ""}`;
  }
  if (line.chargeType === "WARRANTY") return "Default: vehicle covered and part is warranty-applicable";
  if (line.chargeType === "FREE") return `Default: covered by campaign ${line.campaign?.code ?? ""}`;
  return null;
}

function ChargeSelect({
  line,
  data,
  canEdit,
  canGoodwill,
  onChange,
}: {
  line: JobCardLine;
  data: JobCardLines;
  canEdit: boolean;
  canGoodwill: boolean;
  onChange: (to: ChargeType, campaignId?: string) => void;
}) {
  const covered = data.coverageAtCreation === "ACTIVE" || Boolean(data.warrantyCase);
  const warrantyOk = covered && (line.kind === "LABOUR" || line.sparePart?.warrantyApplicable);
  const options: { value: string; label: string }[] = [{ value: "CUSTOMER", label: CHARGE_LABELS.CUSTOMER }];
  if (warrantyOk || line.chargeType === "WARRANTY") options.push({ value: "WARRANTY", label: CHARGE_LABELS.WARRANTY });
  if (canGoodwill || line.chargeType === "GOODWILL") options.push({ value: "GOODWILL", label: CHARGE_LABELS.GOODWILL });
  for (const c of data.linkedCampaigns) options.push({ value: `FREE:${c.id}`, label: `Free – ${c.code}` });
  const value = line.chargeType === "FREE" ? `FREE:${line.campaignId}` : line.chargeType;
  if (line.chargeType === "FREE" && !options.some((o) => o.value === value)) options.push({ value, label: CHARGE_LABELS.FREE });

  if (!canEdit || line.locked) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Pill status={line.chargeType === "FREE" && line.campaign ? `Free – ${line.campaign.code}` : CHARGE_LABELS[line.chargeType]} tone={line.chargeType === "WARRANTY" ? "emerald" : line.chargeType === "GOODWILL" ? "purple" : line.chargeType === "FREE" ? "blue" : "gray"} />
        {line.locked && (
          <span title={line.invoice ? `Billed on ${line.invoice.invoiceNumber}` : `On claim ${line.claim?.caseNumber}`}>
            <Lock className="size-3.5 text-slate-400" />
          </span>
        )}
      </span>
    );
  }
  return (
    <select
      aria-label="Charge to"
      value={value}
      onChange={(e) => {
        const [to, campaignId] = e.target.value.split(":") as [ChargeType, string | undefined];
        onChange(to, campaignId);
      }}
      className={cn("h-8 rounded-full border px-3 pr-7 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring", CHARGE_STYLES[line.chargeType])}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Screen 04 — who pays for each part and labour line. Lines follow the parts issued and the
 * labour recorded on the job card; the job bill charges the customer only for customer lines.
 */
export function JobCardLinesCard({ jobCardId }: { jobCardId: string }) {
  const { hasPermission, isSuperAdmin } = useAuth();
  const can = (p: string) => isSuperAdmin || hasPermission(p);
  const canEdit = can(JOBCARD_LINE_UPDATE);
  const canGoodwill = can(WARRANTY_PERMISSIONS.UPDATE);

  const { data, isLoading, isError } = useJobCardLines(jobCardId);
  const update = useUpdateJobCardLine(jobCardId);
  const [goodwillFor, setGoodwillFor] = useState<JobCardLine | null>(null);

  function changeCharge(line: JobCardLine, to: ChargeType, campaignId?: string) {
    if (to === "GOODWILL") return setGoodwillFor(line);
    update.mutate({ lineId: line.id, body: { chargeType: to, campaignId: campaignId ?? null } });
  }

  const totals = data?.totals;

  return (
    <SectionCard icon={<Wrench />} title="Who pays">
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
      ) : isError || !data ? (
        <p className="text-sm text-red-500">Could not load the job card lines.</p>
      ) : data.lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No parts or labour yet. Issued parts and recorded labour appear here.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/60">
              <tr>
                <th className={thCls}>Type</th>
                <th className={thCls}>Part no. / Operation</th>
                <th className={thCls}>Description</th>
                <th className={`${thCls} text-right`}>Qty / Hrs</th>
                <th className={`${thCls} text-right`}>Rate (₦)</th>
                <th className={`${thCls} text-right`}>Amount (₦)</th>
                <th className={thCls}>Charge to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.lines.map((line) => {
                const reason = defaultReason(line);
                return (
                  <tr key={line.id} className="hover:bg-slate-50">
                    <td className={tdCls}>
                      <Pill status={line.kind === "PART" ? "Part" : "Labour"} tone={line.kind === "PART" ? "blue" : "purple"} />
                    </td>
                    <td className={`${tdCls} font-mono text-xs`}>{line.sparePart?.partNumber ?? line.operationCode ?? "—"}</td>
                    <td className={tdCls}>{line.description}</td>
                    <td className={`${tdCls} text-right`}>{line.kind === "LABOUR" ? line.quantity.toFixed(1) : line.quantity}</td>
                    <td className={`${tdCls} text-right`}>{fmtNaira(line.rate)}</td>
                    <td className={`${tdCls} text-right`}>{fmtNaira(line.amount)}</td>
                    <td className={tdCls}>
                      <span className="inline-flex items-center gap-1.5">
                        <ChargeSelect
                          line={line}
                          data={data}
                          canEdit={canEdit}
                          canGoodwill={canGoodwill}
                          onChange={(to, campaignId) => changeCharge(line, to, campaignId)}
                        />
                        {reason && (
                          <span title={reason} className="cursor-help text-blue-600">
                            <Info className="size-4" />
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totals && data && data.lines.length > 0 && (
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-sm text-sm text-slate-500 print:hidden">
            {data.bill
              ? `Billed on ${data.bill.invoiceNumber}. Who pays for each line is now fixed.`
              : "The job bill charges the customer only for lines charged to the customer. Warranty lines go on the warranty claim."}
          </p>
          <div className="w-full max-w-sm rounded-lg border border-slate-200 p-4 text-sm">
            <dl className="space-y-1 text-slate-600">
              {(
                [
                  ["Customer", totals.customer],
                  ["Warranty (claim)", totals.warranty],
                  ["Goodwill", totals.goodwill],
                  ["Free / campaign", totals.free],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt>{label}</dt>
                  <dd className="tabular-nums">{fmtNaira(value)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3">
              <span className="font-semibold text-slate-900">Customer parts & labour</span>
              <span className="text-right">
                <span className="text-base font-bold tabular-nums text-slate-900">{fmtNaira(totals.customerInvoiceTotal)}</span>
                <span className="block text-xs text-slate-500">incl. {(data.vatRate * 100).toFixed(1)}% VAT</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Before the service charge and bill discounts.</p>
          </div>
        </div>
      )}

      {goodwillFor && (
        <GoodwillDialog
          line={goodwillFor}
          onClose={() => setGoodwillFor(null)}
          onConfirm={(reason) =>
            update.mutate({ lineId: goodwillFor.id, body: { chargeType: "GOODWILL", reason } }, { onSuccess: () => setGoodwillFor(null) })
          }
          pending={update.isPending}
        />
      )}
    </SectionCard>
  );
}

function GoodwillDialog({ line, onClose, onConfirm, pending }: { line: JobCardLine; onClose: () => void; onConfirm: (reason: string) => void; pending: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <ModalFame isOpen onClose={onClose} title="Charge as goodwill">
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-800">{line.description}</span> ({fmtNaira(line.amount)}) will not be billed to the customer and will
          be recorded as goodwill.
        </p>
        <Field label="Reason">
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Approved by workshop manager — repeat repair" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={reason.trim().length < 3 || pending} onClick={() => onConfirm(reason.trim())}>
            Charge goodwill
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
