"use client";

import { useState } from "react";
import { Info, Lock, Trash2, Wrench } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS, JOBCARD_LINE_UPDATE, WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { PartPicker } from "@/features/stock-transfers/components/PartPicker";
import type { PartSearchResult } from "@/features/stock-transfers/types/indent.types";
import { Pill, SectionCard, tdCls, thCls } from "@/features/warranty/components/ui";
import { fmtNaira } from "@/features/warranty/lib/warranty-format";
import { cn } from "@/lib/utils";
import {
  useAddLabourLine,
  useDeleteJobCardLine,
  useGenerateJobCardInvoice,
  useIssuePart,
  useJobCardLines,
  useUpdateJobCardLine,
} from "../hooks/use-job-card-lines";
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

/** Screen 04 — priced parts and labour, who pays for each, and the customer invoice. */
export function JobCardLinesCard({
  jobCardId,
  branchId,
  hasCustomer,
  invoiceRequest = 0,
}: {
  jobCardId: string;
  branchId: string;
  hasCustomer: boolean;
  /** Incremented by the page's "Generate Invoice" button to open the invoice dialog. */
  invoiceRequest?: number;
}) {
  const { user, hasPermission, isSuperAdmin } = useAuth();
  const can = (p: string) => isSuperAdmin || hasPermission(p);
  const canEdit = can(JOBCARD_LINE_UPDATE);
  const canGoodwill = can(WARRANTY_PERMISSIONS.UPDATE);
  const canIssue = can(INVENTORY_PERMISSIONS.PARTISSUANCE_CREATE);
  const canInvoice = can("invoice:create");

  const { data, isLoading, isError } = useJobCardLines(jobCardId);
  const update = useUpdateJobCardLine(jobCardId);
  const remove = useDeleteJobCardLine(jobCardId);
  const [dialog, setDialog] = useState<"labour" | "part" | "invoice" | null>(null);
  const [goodwillFor, setGoodwillFor] = useState<JobCardLine | null>(null);
  const [lastRequest, setLastRequest] = useState(invoiceRequest);
  if (invoiceRequest !== lastRequest) {
    setLastRequest(invoiceRequest);
    if (invoiceRequest > 0) setDialog("invoice");
  }

  function changeCharge(line: JobCardLine, to: ChargeType, campaignId?: string) {
    if (to === "GOODWILL") return setGoodwillFor(line);
    update.mutate({ lineId: line.id, body: { chargeType: to, campaignId: campaignId ?? null } });
  }

  const totals = data?.totals;
  const invoiced = data?.lines.some((l) => l.invoice) ?? false;

  return (
    <SectionCard
      icon={<Wrench />}
      title="Parts & Labour"
      action={
        <div className="flex flex-wrap gap-2 print:hidden">
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setDialog("labour")}>
              Add labour
            </Button>
          )}
          {canIssue && (
            <Button size="sm" onClick={() => setDialog("part")}>
              Add part
            </Button>
          )}
        </div>
      }
    >
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
      ) : isError || !data ? (
        <p className="text-sm text-red-500">Could not load the job card lines.</p>
      ) : data.lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No parts or labour yet. Issue parts from stock or add labour lines.</p>
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
                <th className={thCls} />
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
                    <td className={`${tdCls} text-right`}>
                      {canEdit && line.kind === "LABOUR" && !line.locked && !line.claim && (
                        <button
                          type="button"
                          aria-label="Remove line"
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => remove.mutate(line.id)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
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
          <div className="print:hidden">
            {canInvoice && hasCustomer && !invoiced && (
              <Button onClick={() => setDialog("invoice")} disabled={totals.customer <= 0}>
                Generate invoice
              </Button>
            )}
            {invoiced && <p className="text-sm text-slate-500">Customer lines are invoiced.</p>}
          </div>
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
              <span className="font-semibold text-slate-900">Customer invoice total</span>
              <span className="text-right">
                <span className="text-base font-bold tabular-nums text-slate-900">{fmtNaira(totals.customerInvoiceTotal)}</span>
                <span className="block text-xs text-slate-500">incl. {(data.vatRate * 100).toFixed(1)}% VAT</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Only lines charged to the customer are invoiced.</p>
          </div>
        </div>
      )}

      {dialog === "labour" && data && <LabourDialog jobCardId={jobCardId} onClose={() => setDialog(null)} />}
      {dialog === "part" && user && <IssuePartDialog jobCardId={jobCardId} branchId={branchId} userId={user.id} onClose={() => setDialog(null)} />}
      {dialog === "invoice" && totals && <InvoiceDialog jobCardId={jobCardId} total={totals.customerInvoiceTotal} onClose={() => setDialog(null)} />}
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

function LabourDialog({ jobCardId, onClose }: { jobCardId: string; onClose: () => void }) {
  const add = useAddLabourLine(jobCardId);
  const [operationCode, setOperationCode] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [rate, setRate] = useState("");
  const h = Number(hours);
  const r = Number(rate);
  const valid = description.trim().length > 0 && h > 0 && r >= 0 && rate !== "";
  return (
    <ModalFame isOpen onClose={onClose} title="Add labour">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) add.mutate({ operationCode: operationCode.trim() || null, description: description.trim(), hours: h, rate: r }, { onSuccess: onClose });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field label="Operation code">
            <input className={cn(inputCls, "font-mono")} value={operationCode} onChange={(e) => setOperationCode(e.target.value)} placeholder="SRV-60K" />
          </Field>
          <Field label="Description">
            <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Periodic service 60k" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Hours">
            <input className={inputCls} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="2.0" />
          </Field>
          <Field label="Rate per hour (₦)">
            <input className={inputCls} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="24000" />
          </Field>
          <Field label="Amount">
            <p className="flex h-10 items-center text-sm font-semibold">{valid ? fmtNaira(Math.round(h * r * 100) / 100) : "—"}</p>
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          Who pays is set automatically (free when a linked campaign covers the operation) and can be changed on the line.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid || add.isPending}>
            {add.isPending ? "Adding…" : "Add labour"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}

function IssuePartDialog({ jobCardId, branchId, userId, onClose }: { jobCardId: string; branchId: string; userId: string; onClose: () => void }) {
  const issue = useIssuePart(jobCardId);
  const [part, setPart] = useState<PartSearchResult | null>(null);
  const [qty, setQty] = useState("1");
  const quantity = Number(qty);
  const valid = Boolean(part) && Number.isInteger(quantity) && quantity > 0;
  return (
    <ModalFame isOpen onClose={onClose} title="Issue part to job card">
      <div className="grid gap-4">
        <Field label="Part">
          <PartPicker requestingBranchId={branchId} onSelect={setPart} />
        </Field>
        {part && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-mono text-xs text-slate-500">{part.partNumber}</p>
            <p className="font-medium text-slate-800">{part.name}</p>
            <p className="text-xs text-slate-500">In stock at this branch: {part.requestingStock}</p>
          </div>
        )}
        <Field label="Quantity">
          <input className={inputCls} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <p className="text-xs text-slate-500">The part is taken out of branch stock and priced on the job card.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || issue.isPending}
            onClick={() => part && issue.mutate({ sparePartId: part.id, branchId, jobCardId, issuedById: userId, quantity }, { onSuccess: onClose })}
          >
            {issue.isPending ? "Issuing…" : "Issue part"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}

function InvoiceDialog({ jobCardId, total, onClose }: { jobCardId: string; total: number; onClose: () => void }) {
  const generate = useGenerateJobCardInvoice(jobCardId);
  const [notes, setNotes] = useState("");
  return (
    <ModalFame isOpen onClose={onClose} title="Generate customer invoice">
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          The invoice bills only the lines charged to the customer. Warranty, goodwill and free campaign lines are not billed.
        </p>
        <div className="flex items-baseline justify-between rounded-lg border border-slate-200 p-4">
          <span className="font-semibold">Customer invoice total</span>
          <span className="text-lg font-bold">{fmtNaira(total)}</span>
        </div>
        <Field label="Notes (optional)">
          <textarea className={cn(inputCls, "h-20 py-2")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={generate.isPending} onClick={() => generate.mutate({ notes: notes.trim() || null }, { onSuccess: onClose })}>
            {generate.isPending ? "Generating…" : "Generate invoice"}
          </Button>
        </div>
      </div>
    </ModalFame>
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
