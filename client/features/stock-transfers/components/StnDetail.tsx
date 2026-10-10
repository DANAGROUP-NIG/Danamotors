"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Boxes, Loader2, PackageCheck, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { useStn } from "../hooks/use-stns";
import { ReceiveStnForm } from "./IndentDialogs";
import {
  STN_STATUS_LABELS,
  STN_STATUS_TONES,
  TRANSPORT_MODE_LABELS,
  fmtCurrency,
  fmtDate,
  fmtDateTime,
  personName,
} from "../lib/indent-status";

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";

function DetailField({ label, value, wide }: { label: string; value?: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-0.5 break-words text-sm text-slate-700">{value ?? "—"}</div>
    </div>
  );
}

/** One STN with its indents, cases, packing list cum gate pass and MRNs; the receiving branch posts MRNs here. */
export function StnDetail({ id }: { id: string }) {
  const { data: stn, isLoading, error } = useStn(id);
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const [receiving, setReceiving] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error || !stn) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/transfers/stn" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to STNs
        </Link>
        <p className="text-sm text-red-500">STN not found, or you do not have access to it.</p>
      </div>
    );
  }

  const crossBranch = isSuperAdmin || hasPermission(INVENTORY_PERMISSIONS.INVENTORY_CROSS_BRANCH);
  const canReceive =
    (stn.status === "DISPATCHED" || stn.status === "PARTIALLY_RECEIVED") &&
    (crossBranch || user?.branchId === stn.destinationBranchId) &&
    hasPermission(INVENTORY_PERMISSIONS.TRANSFER_RECEIVE);
  const caseOf = (lineId: string) => stn.cases.filter((c) => c.lines.some((l) => l.stnLineId === lineId)).map((c) => c.caseNumber);

  return (
    <div className="px-4 py-6 lg:px-6 print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/transfers/stn" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to STNs
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          {canReceive && (
            <Button size="sm" className="gap-1.5" onClick={() => setReceiving(true)}>
              <PackageCheck className="size-4" /> Generate MRN
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                Stock transfer note{stn.indents.length === 0 ? " · direct" : ""}
              </p>
              <h1 className="font-mono text-xl font-semibold text-slate-800">{stn.stnNumber}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {stn.sourceBranch.name} → {stn.destinationBranch.name}
              </p>
            </div>
            <StatusBadge status={STN_STATUS_LABELS[stn.status]} tone={STN_STATUS_TONES[stn.status]} />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <DetailField label="STN date" value={fmtDate(stn.documentDate)} />
            <DetailField label="Dispatched by" value={personName(stn.dispatchedBy)} />
            <DetailField label="Mode of transport" value={stn.transportMode ? TRANSPORT_MODE_LABELS[stn.transportMode] : null} />
            <DetailField label="Tax form" value={stn.taxForm} />
            <DetailField label="Qty / value" value={`${stn.totalQuantity} · ${fmtCurrency(stn.totalValue)}`} />
            <DetailField label="Gate pass" value={stn.packingList?.gatePassNumber} />
            <DetailField label="Packing list" value={stn.packingList?.packingNumber} />
            <DetailField label="Waybill / courier" value={[stn.packingList?.waybillNumber, stn.packingList?.courierName].filter(Boolean).join(" · ") || null} />
            <DetailField
              wide
              label="Indents"
              value={
                stn.indents.length ? (
                  stn.indents.map((i, index) => (
                    <span key={i.id}>
                      {index > 0 && ", "}
                      <Link href={`/transfers/indents/${i.id}`} className="font-mono text-primary hover:underline">
                        {i.indentNumber}
                      </Link>
                    </span>
                  ))
                ) : (
                  "None (direct STN)"
                )
              }
            />
            {stn.remarks && <DetailField wide label="Remarks" value={stn.remarks} />}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="mb-4 text-sm font-semibold text-slate-700">Parts</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>Indent</th>
                  <th className={thCls}>Part no.</th>
                  <th className={thCls}>Description</th>
                  <th className={thCls}>Case</th>
                  <th className={cn(thCls, "text-right")}>Qty</th>
                  <th className={cn(thCls, "text-right")}>Rate</th>
                  <th className={cn(thCls, "text-right")}>Amount</th>
                  <th className={cn(thCls, "text-right")}>Received</th>
                  <th className={cn(thCls, "text-right")}>Damaged</th>
                  <th className={cn(thCls, "text-right")}>Short</th>
                </tr>
              </thead>
              <tbody>
                {stn.lines.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className={cn(tdCls, "font-mono")}>
                      {l.indentLine ? (
                        <Link href={`/transfers/indents/${l.indentLine.indent.id}`} className="hover:underline">
                          {l.indentLine.indent.indentNumber}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={cn(tdCls, "font-mono font-medium")}>
                      {l.part.partNumber}
                      {l.isAlternate && <span className="block text-xs font-normal text-purple-700">alt. for {l.requestedPart.partNumber}</span>}
                    </td>
                    <td className={cn(tdCls, "max-w-64 truncate")}>{l.part.name}</td>
                    <td className={cn(tdCls, "font-mono text-slate-500")}>{caseOf(l.id).join(", ") || "—"}</td>
                    <td className={cn(tdCls, "text-right")}>{l.quantity}</td>
                    <td className={cn(tdCls, "text-right")}>{fmtCurrency(l.unitRate)}</td>
                    <td className={cn(tdCls, "text-right")}>{fmtCurrency(l.amount)}</td>
                    <td className={cn(tdCls, "text-right", l.receivedQuantity ? "font-medium text-emerald-700" : "text-slate-300")}>{l.receivedQuantity}</td>
                    <td className={cn(tdCls, "text-right", l.damagedQuantity ? "text-red-600" : "text-slate-300")}>{l.damagedQuantity}</td>
                    <td className={cn(tdCls, "text-right", l.shortQuantity ? "text-red-600" : "text-slate-300")}>{l.shortQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {stn.cases.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <p className="flex items-center justify-between gap-2 font-medium text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <Boxes className="size-4" /> Case <span className="font-mono">{c.caseNumber}</span>
                </span>
                <span className="font-normal text-slate-500">
                  {c.totalQuantity} units{c.weight ? ` · ${c.weight} kg` : ""}
                  {c.packerName ? ` · ${c.packerName}` : ""}
                </span>
              </p>
            </div>
          ))}
          {stn.mrns.map((mrn) => (
            <div key={mrn.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <span className="text-xs font-medium uppercase tracking-wider text-emerald-700">MRN</span>{" "}
                  <span className="font-mono font-semibold text-emerald-900">{mrn.mrnNumber}</span>
                </span>
                <span className="text-emerald-800">
                  {fmtDateTime(mrn.receiptDate)} · {personName(mrn.receivedBy)}
                </span>
              </p>
              <p className="mt-1 text-emerald-900">
                {mrn.totalReceived} received{mrn.totalDamaged ? `, ${mrn.totalDamaged} damaged` : ""}
                {mrn.totalShort ? `, ${mrn.totalShort} short` : ""} · {fmtCurrency(mrn.totalValue)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {receiving && (
        <ModalFame isOpen onClose={() => setReceiving(false)} title={`Receive STN ${stn.stnNumber}`}>
          <ReceiveStnForm
            stn={stn}
            receivingBranchName={stn.destinationBranch.name}
            onDone={() => setReceiving(false)}
            onCancel={() => setReceiving(false)}
          />
        </ModalFame>
      )}
    </div>
  );
}
