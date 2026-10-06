"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, ClipboardCheck, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { useCancelMit, useCreateMrn, useMobisMit } from "../hooks/use-mobis";
import {
  MIT_STATUS_LABELS,
  MIT_STATUS_TONES,
  RECEIVED_MODE_LABELS,
  fmtDate,
  fmtNaira,
  fmtPrice,
} from "../lib/mobis-labels";
import type { MobisMit } from "../types/mobis.types";

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";
const numCls = cn(inputCls, "ml-auto h-9 w-20 text-right");
const toInt = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

function DetailField({ label, value, wide }: { label: string; value?: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-0.5 break-words text-sm text-slate-700">{value ?? "—"}</div>
    </div>
  );
}

function MrnDialog({ mit, onClose }: { mit: MobisMit; onClose: () => void }) {
  const createMrn = useCreateMrn(mit.id);
  const [taxForm, setTaxForm] = useState("P");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [rows, setRows] = useState<Record<string, { received: string; damaged: string }>>(() =>
    Object.fromEntries(mit.lines.map((l) => [l.id, { received: String(l.quantity), damaged: "0" }])),
  );

  const values = mit.lines.map((l) => {
    const r = toInt(rows[l.id]?.received ?? "0");
    const d = toInt(rows[l.id]?.damaged ?? "0");
    const ok = Number.isFinite(r) && Number.isFinite(d) && r + d <= l.quantity;
    return { line: l, r, d, ok, short: ok ? l.quantity - r - d : 0 };
  });
  const invalid = values.some((v) => !v.ok);
  const totals = values.reduce(
    (t, v) => ({
      received: t.received + (v.ok ? v.r : 0),
      damaged: t.damaged + (v.ok ? v.d : 0),
      short: t.short + v.short,
      value: t.value + (v.ok ? v.r * v.line.unitPrice * mit.conversionRate : 0),
    }),
    { received: 0, damaged: 0, short: 0, value: 0 },
  );

  function confirm() {
    const changed = values.filter((v) => v.r !== v.line.quantity || v.d !== 0);
    createMrn.mutate(
      {
        taxForm: taxForm.trim() || "P",
        receiptDate,
        remarks: remarks.trim() || undefined,
        // Empty means "everything received". Otherwise send every line so nothing is assumed.
        lines: changed.length
          ? values.map((v) => ({ mitLineId: v.line.id, receivedQuantity: v.r, damagedQuantity: v.d || undefined }))
          : undefined,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalFame isOpen onClose={onClose} title={`Generate MRN for MIT ${mit.mitNumber}`}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          Confirm what physically arrived. Good units are added to {mit.destinationBranch.name} stock. Damaged units are
          recorded but not added, and anything not entered as received or damaged is recorded as short.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tax form">
            <input className={inputCls} maxLength={2} value={taxForm} onChange={(e) => setTaxForm(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Conversion rate">
            <input className={inputCls} value={mit.conversionRate} readOnly />
          </Field>
          <Field label="Receipt date">
            <input type="date" className={inputCls} value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
          </Field>
        </div>
        <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className={thCls}>Part</th>
                <th className={thCls}>Case</th>
                <th className={cn(thCls, "text-right")}>Invoiced</th>
                <th className={cn(thCls, "text-right")}>Received good</th>
                <th className={cn(thCls, "text-right")}>Damaged</th>
                <th className={cn(thCls, "text-right")}>Short</th>
              </tr>
            </thead>
            <tbody>
              {values.map(({ line, ok, short }) => (
                <tr key={line.id} className="border-t border-slate-100">
                  <td className={tdCls}>
                    <p className="font-mono text-sm font-medium">{line.part.partNumber}</p>
                    <p className="max-w-48 truncate text-sm text-slate-500">{line.part.name}</p>
                  </td>
                  <td className={cn(tdCls, "font-mono text-sm text-slate-500")}>{line.caseNumbers ?? "—"}</td>
                  <td className={cn(tdCls, "text-right")}>{line.quantity}</td>
                  {(["received", "damaged"] as const).map((field) => (
                    <td key={field} className={cn(tdCls, "text-right")}>
                      <input
                        type="number"
                        min={0}
                        className={cn(numCls, !ok && "border-red-400")}
                        value={rows[line.id]?.[field] ?? ""}
                        onChange={(e) => setRows((prev) => ({ ...prev, [line.id]: { ...prev[line.id], [field]: e.target.value } }))}
                      />
                    </td>
                  ))}
                  <td className={cn(tdCls, "text-right", short > 0 ? "font-medium text-amber-700" : "text-slate-400")}>{short}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {invalid && <p className="text-sm text-red-500">Received plus damaged cannot exceed the invoiced quantity.</p>}
        <Field label="Remarks (optional)">
          <input className={inputCls} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            {totals.received} received, {totals.damaged} damaged, {totals.short} short · value {fmtNaira(totals.value)}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button disabled={invalid || createMrn.isPending} onClick={confirm}>
              {createMrn.isPending ? "Posting…" : "Generate MRN"}
            </Button>
          </div>
        </div>
      </div>
    </ModalFame>
  );
}

function CancelDialog({ mit, onClose }: { mit: MobisMit; onClose: () => void }) {
  const cancel = useCancelMit(mit.id);
  const [reason, setReason] = useState("");
  return (
    <ModalFame isOpen onClose={onClose} title={`Cancel MIT ${mit.mitNumber}`}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          No stock has been posted for this invoice. After cancelling, the same invoice can be uploaded again.
        </p>
        <Field label="Reason (optional)">
          <input className={inputCls} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate(reason.trim() || undefined, { onSuccess: onClose })}>
            {cancel.isPending ? "Cancelling…" : "Cancel MIT"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}

export function MitDetail({ id }: { id: string }) {
  const { data: mit, isLoading, error } = useMobisMit(id);
  const { hasPermission } = useAuth();
  const canPost = hasPermission(INVENTORY_PERMISSIONS.STOCK_UPDATE);
  const [dialog, setDialog] = useState<"mrn" | "cancel" | null>(null);
  const cases = useMemo(() => new Set((mit?.lines ?? []).map((l) => l.caseNumbers).filter(Boolean)).size, [mit]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error || !mit) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/inventory/mobis-receipts" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Mobis Receipts
        </Link>
        <p className="text-sm text-red-500">MIT not found, or you do not have access to it.</p>
      </div>
    );
  }

  const open = mit.status === "IN_TRANSIT" || mit.status === "VERIFIED";
  const newParts = mit.lines.filter((l) => l.newPart);

  return (
    <div className="px-4 py-6 lg:px-6 print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/inventory/mobis-receipts" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Mobis Receipts
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          {canPost && open && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5 text-red-600" onClick={() => setDialog("cancel")}>
                <Ban className="size-4" /> Cancel
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setDialog("mrn")}>
                <ClipboardCheck className="size-4" /> Generate MRN
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Material in transit · Mobis</p>
              <h1 className="font-mono text-xl font-semibold text-slate-800">{mit.mitNumber}</h1>
              <p className="mt-1 text-sm text-slate-500">
                Invoice <span className="font-mono">{mit.invoiceNumber}</span> → {mit.destinationBranch.name}
              </p>
            </div>
            <StatusBadge status={MIT_STATUS_LABELS[mit.status]} tone={MIT_STATUS_TONES[mit.status]} />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <DetailField label="Invoice date" value={fmtDate(mit.invoiceDate)} />
            <DetailField label="Physical receipt date" value={fmtDate(mit.physicalReceiptDate)} />
            <DetailField label="Received mode" value={mit.receivedMode ? RECEIVED_MODE_LABELS[mit.receivedMode] : null} />
            <DetailField label="Conversion rate" value={mit.conversionRate} />
            <DetailField label="Lines / quantity" value={`${mit.lines.length} / ${mit.totalQuantity}`} />
            <DetailField label="Cases" value={cases} />
            <DetailField label="Invoice value" value={`${fmtPrice(mit.totalAmount)} (${fmtNaira(mit.totalAmount * mit.conversionRate)})`} />
            <DetailField
              label="Uploaded"
              value={`${mit.createdBy ? `${mit.createdBy.firstName} ${mit.createdBy.lastName} · ` : ""}${fmtDate(mit.createdAt)}`}
            />
            {mit.sourceFileName && <DetailField label="File" value={mit.sourceFileName} />}
            {mit.remarks && <DetailField wide label="Remarks" value={<span className="whitespace-pre-line">{mit.remarks}</span>} />}
          </div>
          {newParts.length > 0 && (
            <p className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              {newParts.length} part(s) were added to Part Master from this invoice:{" "}
              {newParts.map((l, i) => (
                <span key={l.id}>
                  {i > 0 && ", "}
                  <Link href={`/inventory/${l.partId}`} className="font-mono font-medium hover:underline">
                    {l.part.partNumber}
                  </Link>
                </span>
              ))}
              . Complete their category, price category and location there.
            </p>
          )}
        </div>

        {mit.mrn && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm">
                <span className="text-sm font-medium uppercase tracking-wider text-emerald-700">MRN</span>{" "}
                <span className="font-mono text-lg font-semibold text-emerald-900">{mit.mrn.mrnNumber}</span>
              </p>
              <p className="text-sm text-emerald-800">
                {fmtDate(mit.mrn.receiptDate)}
                {mit.mrn.receivedBy ? ` · ${mit.mrn.receivedBy.firstName} ${mit.mrn.receivedBy.lastName}` : ""} · tax form {mit.mrn.taxForm}
              </p>
            </div>
            <p className="mt-2 text-sm text-emerald-900">
              {mit.mrn.totalReceived} received into {mit.destinationBranch.name} stock
              {mit.mrn.totalDamaged ? `, ${mit.mrn.totalDamaged} damaged` : ""}
              {mit.mrn.totalShort ? `, ${mit.mrn.totalShort} short` : ""} · value {fmtNaira(mit.mrn.totalValue)}
            </p>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="mb-4 text-sm font-semibold text-slate-700">Invoice lines</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>Order no.</th>
                  <th className={thCls}>L / I</th>
                  <th className={thCls}>Part no.</th>
                  <th className={thCls}>Part name</th>
                  <th className={cn(thCls, "text-right")}>Qty</th>
                  <th className={cn(thCls, "text-right")}>Unit price</th>
                  <th className={cn(thCls, "text-right")}>Amount</th>
                  <th className={thCls}>Case no.</th>
                  <th className={thCls}>Weight</th>
                  <th className={thCls}>HS code</th>
                  {mit.mrn && <th className={cn(thCls, "text-right")}>Received</th>}
                  {mit.mrn && <th className={cn(thCls, "text-right")}>Damaged</th>}
                  {mit.mrn && <th className={cn(thCls, "text-right")}>Short</th>}
                </tr>
              </thead>
              <tbody>
                {mit.lines.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className={cn(tdCls, "font-mono text-sm")}>{l.orderNumber ?? ""}</td>
                    <td className={cn(tdCls, "font-mono text-sm")}>{l.lineNumber != null ? String(l.lineNumber).padStart(4, "0") : ""}</td>
                    <td className={tdCls}>
                      <Link href={`/inventory/${l.partId}`} className="font-mono text-sm font-medium hover:underline">
                        {l.part.partNumber}
                      </Link>
                      {l.newPart && <span className="ml-1.5 rounded bg-blue-50 px-1 text-[10px] font-semibold text-blue-700">NEW</span>}
                    </td>
                    <td className={cn(tdCls, "max-w-64 truncate")}>{l.filePartName ?? l.part.name}</td>
                    <td className={cn(tdCls, "text-right")}>{l.quantity}</td>
                    <td className={cn(tdCls, "text-right")}>{fmtPrice(l.unitPrice)}</td>
                    <td className={cn(tdCls, "text-right")}>{fmtPrice(l.amount)}</td>
                    <td className={cn(tdCls, "font-mono text-sm")}>{l.caseNumbers ?? ""}</td>
                    <td className={tdCls}>{l.weight ?? ""}</td>
                    <td className={tdCls}>{l.hsCode ?? ""}</td>
                    {mit.mrn && <td className={cn(tdCls, "text-right font-medium text-emerald-700")}>{l.receivedQuantity}</td>}
                    {mit.mrn && <td className={cn(tdCls, "text-right", l.damagedQuantity ? "text-red-600" : "text-slate-300")}>{l.damagedQuantity}</td>}
                    {mit.mrn && <td className={cn(tdCls, "text-right", l.shortQuantity ? "text-red-600" : "text-slate-300")}>{l.shortQuantity}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {dialog === "mrn" && <MrnDialog mit={mit} onClose={() => setDialog(null)} />}
      {dialog === "cancel" && <CancelDialog mit={mit} onClose={() => setDialog(null)} />}
    </div>
  );
}
