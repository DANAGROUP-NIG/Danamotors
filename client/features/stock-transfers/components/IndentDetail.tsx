"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Boxes,
  CheckCircle,
  ClipboardList,
  FileText,
  History,
  Loader2,
  PackageCheck,
  PackageSearch,
  Printer,
  Send,
  Truck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { cn } from "@/lib/utils";
import { useIndent } from "../hooks/use-indents";
import { usePickIndent, useSubmitIndent } from "../hooks/use-indent-mutations";
import { useIndentAbilities } from "../hooks/use-indent-abilities";
import { IndentProgress } from "./IndentProgress";
import { ApproveIndentDialog, DispatchIndentDialog, ReasonDialog, ReceiveIndentDialog } from "./IndentDialogs";
import {
  INDENT_STATUS_LABELS,
  INDENT_STATUS_TONES,
  TRANSPORT_MODE_LABELS,
  fmtCurrency,
  fmtDate,
  fmtDateTime,
  MOBIS_ORDER_MODE_LABELS,
  personName,
} from "../lib/indent-status";
import type { Indent } from "../types/indent.types";

type DialogKind = "approve" | "dispatch" | "receive" | "reject" | "cancel" | null;

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 align-top";

function SectionCard({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 print:border print:shadow-none">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          {icon}
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function DetailField({ label, value, wide }: { label: string; value?: ReactNode; wide?: boolean }) {
  return (
    <div>
      <p className="text-sm font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-0.5 text-sm text-slate-700">{value ?? "—"}</div>
    </div>
  );
}

function Qty({ n, tone }: { n: number | null; tone?: "amber" | "red" | "emerald" }) {
  if (n === null) return <span className="text-slate-300">—</span>;
  return (
    <span
      className={cn(
        n === 0 && "text-slate-300",
        n > 0 && tone === "amber" && "font-medium text-amber-700",
        n > 0 && tone === "red" && "font-medium text-red-600",
        n > 0 && tone === "emerald" && "font-medium text-emerald-700",
      )}
    >
      {n}
    </span>
  );
}

export function IndentDetail({ id }: { id: string }) {
  const { data: indent, isLoading, error } = useIndent(id);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { abilities } = useIndentAbilities();
  const submit = useSubmitIndent();
  const pick = usePickIndent();
  const [dialog, setDialog] = useState<DialogKind>(null);

  const can = indent ? abilities(indent) : null;

  // Open the dialog requested from the list page (e.g. ?action=dispatch) once, then clean the URL.
  const requested = searchParams.get("action") as DialogKind;
  const handledAction = useRef(false);
  useEffect(() => {
    if (!requested || !can || handledAction.current) return;
    handledAction.current = true;
    if (requested in can && can[requested as keyof typeof can]) setDialog(requested);
    router.replace(pathname);
  }, [requested, can, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !indent || !can) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/transfers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Stock Transfers
        </Link>
        <p className="text-sm text-red-500">Indent not found, or you do not have access to it.</p>
      </div>
    );
  }

  const stopped = indent.status === "REJECTED" || indent.status === "CANCELLED" ? indent.status : null;
  const totalAmount = indent.lines.reduce((s, l) => s + l.amount, 0);
  const backOrderLines = indent.lines.filter((l) => l.backOrderQuantity > 0);
  const close = () => setDialog(null);

  return (
    <div className="px-4 py-6 lg:px-6 print:px-0 print:py-0">
      {/* ── Top bar ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/transfers" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Stock Transfers
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
            <Printer className="size-4" /> Print
          </Button>
          {can.cancel && (
            <Button size="sm" variant="outline" onClick={() => setDialog("cancel")} className="gap-1.5 text-red-600">
              <Ban className="size-4" /> Cancel
            </Button>
          )}
          {can.reject && (
            <Button size="sm" variant="outline" onClick={() => setDialog("reject")} className="gap-1.5 text-red-600">
              <XCircle className="size-4" /> Reject
            </Button>
          )}
          {can.submit && (
            <Button size="sm" disabled={submit.isPending} onClick={() => submit.mutate(indent.id)} className="gap-1.5">
              <Send className="size-4" /> Submit
            </Button>
          )}
          {can.approve && (
            <Button size="sm" onClick={() => setDialog("approve")} className="gap-1.5">
              <CheckCircle className="size-4" /> Approve
            </Button>
          )}
          {can.pick && (
            <Button size="sm" disabled={pick.isPending} onClick={() => pick.mutate(indent.id)} className="gap-1.5">
              <PackageSearch className="size-4" /> Retry picking
            </Button>
          )}
          {can.dispatch && (
            <Button size="sm" onClick={() => setDialog("dispatch")} className="gap-1.5">
              <Truck className="size-4" /> Dispatch
            </Button>
          )}
          {can.receive && (
            <Button size="sm" onClick={() => setDialog("receive")} className="gap-1.5">
              <PackageCheck className="size-4" /> Generate MRN
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* ── Header ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 print:border print:shadow-none">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Branch indent</p>
              <h1 className="font-mono text-xl font-semibold text-slate-800">{indent.indentNumber}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {indent.sourceBranch.name} → {indent.requestingBranch.name}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Created {fmtDateTime(indent.createdAt)}</span>
              <StatusBadge status={INDENT_STATUS_LABELS[indent.status]} tone={INDENT_STATUS_TONES[indent.status]} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <DetailField label="Requesting branch" value={indent.requestingBranch.name} />
            <DetailField label="Supplying branch" value={indent.sourceBranch.name} />
            <DetailField label="Requested by" value={personName(indent.requestedBy)} />
            <DetailField label="Order date" value={fmtDate(indent.orderDate)} />
            <DetailField
              label="Authorised by"
              value={indent.authorisedBy ? `${indent.authorisedBy} · ${fmtDate(indent.authorisedAt)}` : null}
            />
            {indent.approvedBy && (
              <DetailField label="Approved by" value={`${personName(indent.approvedBy)} · ${fmtDate(indent.approvedAt)}`} />
            )}
            <DetailField label="Order value" value={fmtCurrency(totalAmount)} />
            {indent.remarks && <DetailField wide label="Remarks" value={indent.remarks} />}
            {indent.approvalRemarks && <DetailField wide label="Approval remarks" value={indent.approvalRemarks} />}
          </div>

          {indent.status === "REJECTED" && (
            <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Rejected by {personName(indent.rejectedBy)} on {fmtDate(indent.rejectedAt)}: {indent.rejectionReason}
            </p>
          )}
          {indent.status === "CANCELLED" && (
            <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Cancelled by {personName(indent.cancelledBy)} on {fmtDate(indent.cancelledAt)}
              {indent.cancellationReason ? `: ${indent.cancellationReason}` : "."}
            </p>
          )}
          {indent.status === "APPROVED" && !indent.pickingList && (
            <p className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Nothing could be picked because {indent.sourceBranch.name} has no stock for these parts. Retry picking once
              stock arrives, or cancel the indent.
            </p>
          )}
          {backOrderLines.length > 0 && indent.status !== "APPROVED" && (
            <p className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {backOrderLines.length} {backOrderLines.length === 1 ? "line is" : "lines are"} on back order:{" "}
              {backOrderLines.map((l) => `${l.part.partNumber} ×${l.backOrderQuantity}`).join(", ")}.
            </p>
          )}
        </div>

        {/* ── Progress ── */}
        {!stopped && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 print:hidden">
            <IndentProgress steps={indent.progress} stopped={stopped} />
          </div>
        )}

        {/* ── Lines ── */}
        <SectionCard icon={<ClipboardList className="size-4" />} title="Parts">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>#</th>
                  <th className={thCls}>Part</th>
                  <th className={thCls}>Vehicle / job</th>
                  <th className={cn(thCls, "text-right")} title="Urgent required for vehicle">Urg. veh.</th>
                  <th className={cn(thCls, "text-right")} title="Urgent required for stock">Urg. stock</th>
                  <th className={cn(thCls, "text-right")} title="Stock order (15 days consumption)">Stock order</th>
                  <th className={cn(thCls, "text-right")}>Approved</th>
                  <th className={cn(thCls, "text-right")}>Back order</th>
                  <th className={cn(thCls, "text-right")}>Sent</th>
                  <th className={cn(thCls, "text-right")}>Received</th>
                  <th className={cn(thCls, "text-right")}>Damaged</th>
                  <th className={cn(thCls, "text-right")}>Short</th>
                  <th className={cn(thCls, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {indent.lines.map((l) => {
                  const supplied = indent.stn?.lines.find((s) => s.indentLineId === l.id && s.isAlternate)
                    ?? indent.pickingList?.lines.find((p) => p.indentLineId === l.id && p.isAlternate);
                  return (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className={cn(tdCls, "text-slate-400")}>{l.lineNumber}</td>
                      <td className={tdCls}>
                        <p className="font-mono text-sm font-medium text-slate-800">
                          {l.part.partNumber}
                          {l.partFlag && <span className="ml-1.5 text-slate-400">({l.partFlag})</span>}
                          <span
                            className={cn(
                              "ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold",
                              l.supplyCode === "APN" ? "bg-purple-50 text-purple-700" : "bg-slate-100 text-slate-500",
                            )}
                            title={l.supplyCode === "APN" ? "Alternate part supplied" : "Exact part"}
                          >
                            {l.supplyCode}
                          </span>
                        </p>
                        <p className="text-sm text-slate-500">{l.part.name}</p>
                        {supplied && (
                          <p className="mt-1 text-sm font-medium text-purple-700">
                            Supplied as alternate {supplied.part.partNumber}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400">
                          {l.part.priceCategoryCode ? `Cat. ${l.part.priceCategoryCode} · ` : ""}
                          {fmtCurrency(l.unitRate)} / {l.part.uom} · stock at request {l.currentStock ?? 0}
                        </p>
                      </td>
                      <td className={cn(tdCls, "text-sm text-slate-500")}>
                        {l.registrationNumber || l.jobNumber || l.vin ? (
                          <>
                            {l.registrationNumber && <p className="font-medium text-slate-700">{l.registrationNumber}</p>}
                            {l.vehicleModel && <p>{l.vehicleModel}</p>}
                            {l.vin && <p className="font-mono">{l.vin}</p>}
                            {l.jobNumber && (
                              <p>
                                {l.jobCardId ? (
                                  <Link href={`/job-cards/${l.jobCardId}`} className="text-primary hover:underline">
                                    Job {l.jobNumber}
                                  </Link>
                                ) : (
                                  <>Job {l.jobNumber}</>
                                )}
                                {l.jobDate ? ` · ${fmtDate(l.jobDate)}` : ""}
                              </p>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                        {l.mobisOrderMode && (
                          <p className="mt-1 text-amber-700">Mobis order by {MOBIS_ORDER_MODE_LABELS[l.mobisOrderMode]}</p>
                        )}
                      </td>
                      <td className={cn(tdCls, "text-right")}><Qty n={l.urgentQuantity} /></td>
                      <td className={cn(tdCls, "text-right")}><Qty n={l.stockQuantity} /></td>
                      <td className={cn(tdCls, "text-right")}><Qty n={l.stockOrderQuantity} /></td>
                      <td className={cn(tdCls, "text-right")}><Qty n={l.summary.approved} /></td>
                      <td className={cn(tdCls, "text-right")}><Qty n={l.summary.backOrder} tone="amber" /></td>
                      <td className={cn(tdCls, "text-right")}><Qty n={l.summary.dispatched} /></td>
                      <td className={cn(tdCls, "text-right")}><Qty n={l.summary.received} tone="emerald" /></td>
                      <td className={cn(tdCls, "text-right")}><Qty n={l.summary.damaged} tone="red" /></td>
                      <td className={cn(tdCls, "text-right")}><Qty n={l.summary.short} tone="red" /></td>
                      <td className={cn(tdCls, "text-right font-medium text-slate-700")}>{fmtCurrency(l.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* ── Documents ── */}
        <Documents indent={indent} />

        {/* ── History ── */}
        <SectionCard icon={<History className="size-4" />} title="History">
          <ol className="space-y-3">
            {indent.statusHistory.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                <span className="w-40 shrink-0 text-sm text-slate-400">{fmtDateTime(h.createdAt)}</span>
                <span className="font-medium text-slate-700">{INDENT_STATUS_LABELS[h.toStatus]}</span>
                <span className="text-sm text-slate-500">
                  {personName(h.actor)}
                  {h.remarks ? ` · ${h.remarks}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </SectionCard>
      </div>

      {dialog === "approve" && <ApproveIndentDialog indent={indent} open onClose={close} />}
      {dialog === "dispatch" && <DispatchIndentDialog indent={indent} open onClose={close} />}
      {dialog === "receive" && <ReceiveIndentDialog indent={indent} open onClose={close} />}
      {(dialog === "reject" || dialog === "cancel") && (
        <ReasonDialog indent={indent} open onClose={close} mode={dialog} />
      )}
    </div>
  );
}

// ── Generated documents ──────────────────────────────────────────────────────

function DocHeader({ label, number, meta }: { label: string; number: string; meta?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-sm">
        <span className="text-sm font-medium uppercase tracking-wider text-slate-400">{label}</span>{" "}
        <span className="font-mono font-semibold text-slate-800">{number}</span>
      </p>
      {meta && <p className="text-sm text-slate-500">{meta}</p>}
    </div>
  );
}

function Documents({ indent }: { indent: Indent }) {
  const { pickingList, stn } = indent;
  if (!pickingList && !stn) return null;
  const partNo = (stnLineId: string) => stn?.lines.find((l) => l.id === stnLineId)?.part.partNumber ?? "—";

  return (
    <SectionCard icon={<FileText className="size-4" />} title="Documents">
      <div className="grid gap-5 lg:grid-cols-2">
        {pickingList && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-4">
            <DocHeader
              label="Picking list"
              number={pickingList.pickingNumber}
              meta={`${pickingList.status.toLowerCase()} · ${fmtDate(pickingList.createdAt)}`}
            />
            <ul className="space-y-1 text-sm text-slate-600">
              {pickingList.lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span>
                    <span className="font-mono">{l.part.partNumber}</span>
                    {l.isAlternate && <span className="text-purple-700"> (alt. for {l.requestedPart.partNumber})</span>}
                    {l.binLocation && <span className="text-slate-400"> · bin {l.binLocation}</span>}
                  </span>
                  <span>×{l.pickedQuantity}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {stn && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-4">
            <DocHeader
              label="STN"
              number={stn.stnNumber}
              meta={`${fmtDate(stn.documentDate)} · ${personName(stn.dispatchedBy)}`}
            />
            <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 sm:grid-cols-4">
              <span>Qty {stn.totalQuantity}</span>
              <span>{fmtCurrency(stn.totalValue)}</span>
              <span>{stn.transportMode ? TRANSPORT_MODE_LABELS[stn.transportMode] : "—"}</span>
              <span>Tax form {stn.taxForm ?? "—"}</span>
            </div>
            <p className="text-sm text-emerald-700">
              {stn.stockDeducted ? `Stock deducted from ${indent.sourceBranch.name}` : "Stock not yet deducted"}
            </p>
            {/* The goods travel on the STN; each line shows how much the receiving branch has accounted for. */}
            <ul className="space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
              {stn.lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span className="font-mono">{l.part.partNumber}</span>
                  <span>
                    {l.receivedQuantity + l.damagedQuantity + l.shortQuantity}/{l.quantity} received on MRN
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {stn?.packingList && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-4">
            <DocHeader
              label="Packing list"
              number={stn.packingList.packingNumber}
              meta={fmtDate(stn.packingList.packingDate)}
            />
            <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
              <span>Waybill {stn.packingList.waybillNumber ?? "—"}</span>
              <span>Courier {stn.packingList.courierName ?? "—"}</span>
              <span>
                Mode {stn.packingList.dispatchMode ? TRANSPORT_MODE_LABELS[stn.packingList.dispatchMode] : "—"}
              </span>
              <span>Weight {stn.packingList.consignmentWeight != null ? `${stn.packingList.consignmentWeight} kg` : "—"}</span>
            </div>
            <div className="space-y-2 pt-1">
              {stn.cases.map((c) => (
                <div key={c.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <p className="flex items-center justify-between gap-2 font-medium text-slate-700">
                    <span className="inline-flex items-center gap-1.5">
                      <Boxes className="size-3.5" /> Case <span className="font-mono">{c.caseNumber}</span>
                    </span>
                    <span className="font-normal text-slate-500">
                      {c.totalQuantity} units{c.weight ? ` · ${c.weight} kg` : ""}
                      {c.packerName ? ` · ${c.packerName}` : ""}
                    </span>
                  </p>
                  <p className="mt-1 text-slate-500">
                    {c.lines.map((l) => `${partNo(l.stnLineId)} ×${l.quantity}`).join(", ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {stn?.mrns.map((mrn) => (
          <div key={mrn.id} className="space-y-2 rounded-lg border border-slate-200 p-4">
            <DocHeader
              label="MRN"
              number={mrn.mrnNumber}
              meta={`${fmtDateTime(mrn.receiptDate)} · ${personName(mrn.receivedBy)}`}
            />
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="text-emerald-700">{mrn.totalReceived} received</span>
              {mrn.totalDamaged > 0 && <span className="text-red-600">{mrn.totalDamaged} damaged</span>}
              {mrn.totalShort > 0 && <span className="text-red-600">{mrn.totalShort} short</span>}
              <span className="text-slate-500">{fmtCurrency(mrn.totalValue)}</span>
            </div>
            <ul className="space-y-1 text-xs text-slate-600">
              {mrn.lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span className="font-mono">{l.part.partNumber}</span>
                  <span>
                    {l.receivedQuantity} good
                    {l.damagedQuantity > 0 && ` · ${l.damagedQuantity} damaged`}
                    {l.shortQuantity > 0 && ` · ${l.shortQuantity} short`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {stn?.srns.map((srn) => (
          <div key={srn.id} className="space-y-2 rounded-lg border border-slate-200 p-4">
            <DocHeader
              label="SRN"
              number={srn.srnNumber}
              meta={`${fmtDateTime(srn.receiptDate)} · ${personName(srn.receivedBy)}`}
            />
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-emerald-700">{srn.totalReceived} received</span>
              {srn.totalDamaged > 0 && <span className="text-red-600">{srn.totalDamaged} damaged</span>}
              {srn.totalShort > 0 && <span className="text-red-600">{srn.totalShort} short</span>}
            </div>
            {srn.remarks && <p className="text-sm text-slate-500">{srn.remarks}</p>}
          </div>
        ))}
      </div>
    </SectionCard>
  );

}
