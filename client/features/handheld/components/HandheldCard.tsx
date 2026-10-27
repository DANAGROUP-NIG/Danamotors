"use client";

import { useState } from "react";
import { AlertTriangle, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { StatusBadge, type StatusTone } from "@/components/ui/table-components/StatusBadge";
import { fmtDateTime } from "@/features/stock-transfers/lib/indent-status";
import { cn } from "@/lib/utils";
import { useCancelHandheldDocument, useHandheldDocuments } from "../hooks/use-handheld";
import type {
  HandheldDocument,
  HandheldDocumentStatus,
  HandheldShortReason,
  HandheldSourceFilter,
} from "../types/handheld.types";

export const SHORT_REASON_LABELS: Record<HandheldShortReason, string> = {
  NOT_FOUND: "Not found",
  DAMAGED: "Damaged",
  LESS_IN_BIN: "Less in bin",
  OTHER: "Other",
};

const STATUS: Record<HandheldDocumentStatus, { label: string; tone: StatusTone }> = {
  SENT: { label: "On handheld", tone: "blue" },
  UPLOADED: { label: "Uploaded", tone: "emerald" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";
const person = (p: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : null);

function CancelDialog({ doc, onClose }: { doc: HandheldDocument; onClose: () => void }) {
  const cancel = useCancelHandheldDocument();
  const [remark, setRemark] = useState("");
  return (
    <ModalFame isOpen onClose={onClose} title={`Cancel handheld document ${doc.documentNumber}`}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          The result on the handheld can no longer be uploaded. Reserved stock is not changed; send the document again to
          pick or receive it on a handheld.
        </p>
        <Field label="Reason">
          <input className={inputCls} maxLength={500} value={remark} onChange={(e) => setRemark(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="destructive"
            disabled={!remark.trim() || cancel.isPending}
            onClick={() => cancel.mutate({ id: doc.id, remark: remark.trim() }, { onSuccess: onClose })}
          >
            {cancel.isPending ? "Cancelling…" : "Cancel document"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}

function Results({ doc }: { doc: HandheldDocument }) {
  const receiving = doc.type === "MIT_RECEIVE";
  const lines = (doc.lines ?? []).filter((l) => !l.extra);
  const extras = (doc.lines ?? []).filter((l) => l.extra);
  const attention = lines.filter((l) => l.quantity !== l.expectedQuantity || l.damagedQuantity > 0 || l.scannedPartNumber || l.note);
  return (
    <div className="mt-3 space-y-3">
      {attention.length === 0 ? (
        <p className="text-sm text-emerald-700">
          All {lines.length} line(s) {receiving ? "received in full" : "picked in full"}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={thCls}>Part</th>
                <th className={thCls}>{receiving ? "Case" : "Bin"}</th>
                <th className={cn(thCls, "text-right")}>{receiving ? "Invoiced" : "Reserved"}</th>
                <th className={cn(thCls, "text-right")}>{receiving ? "Received" : "Picked"}</th>
                {receiving && <th className={cn(thCls, "text-right")}>Damaged</th>}
                <th className={thCls}>{receiving ? "Note" : "Reason / note"}</th>
              </tr>
            </thead>
            <tbody>
              {attention.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className={tdCls}>
                    <p className="font-mono text-sm font-medium">{l.partNumber}</p>
                    {l.partName && <p className="max-w-48 truncate text-sm text-slate-500">{l.partName}</p>}
                  </td>
                  <td className={cn(tdCls, "font-mono text-sm text-slate-500")}>{(receiving ? l.caseNumber : l.binLocation) ?? "—"}</td>
                  <td className={cn(tdCls, "text-right")}>{l.expectedQuantity}</td>
                  <td className={cn(tdCls, "text-right font-medium", l.quantity === null ? "text-slate-400" : l.quantity < l.expectedQuantity ? "text-amber-700" : "")}>
                    {l.quantity ?? "not checked"}
                  </td>
                  {receiving && <td className={cn(tdCls, "text-right", l.damagedQuantity ? "text-red-600" : "text-slate-300")}>{l.damagedQuantity}</td>}
                  <td className="px-3 py-2 text-sm">
                    {l.shortReason && <span className="mr-2 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{SHORT_REASON_LABELS[l.shortReason]}</span>}
                    {l.scannedPartNumber && (
                      <span className="mr-2 text-purple-700">
                        Scanned <span className="font-mono">{l.scannedPartNumber}</span> instead
                      </span>
                    )}
                    {l.note && <span className="text-slate-600">{l.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!receiving && attention.some((l) => (l.quantity ?? 0) < l.expectedQuantity) && (
        <p className="text-sm text-slate-500">
          {doc.type === "INDENT_PICK" ? "Short quantities went back to the back order." : "Short quantities went back to free stock."}
        </p>
      )}
      {lines.some((l) => l.scannedPartNumber) && (
        <p className="text-sm text-slate-500">A scanned substitute is not counted; supply it as an alternate if it should go.</p>
      )}
      {extras.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Not on this MIT (not received into stock):{" "}
            {extras.map((e, i) => (
              <span key={e.id}>
                {i > 0 && ", "}
                <span className="font-mono">{e.partNumber}</span> ×{e.quantity}
                {e.damagedQuantity ? ` (+${e.damagedQuantity} damaged)` : ""}
                {e.note ? ` (${e.note})` : ""}
              </span>
            ))}
            . Take it up with Mobis.
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Handheld documents of a picking source (indent, CPO or MIT): what is on a device now, the uploaded
 * result, and earlier cancelled ones. Sending and uploading happen in HHDC Link.
 */
export function HandheldCard({ filter, canWrite }: { filter: HandheldSourceFilter; canWrite: boolean }) {
  const { data: documents } = useHandheldDocuments(filter);
  const [cancelling, setCancelling] = useState<HandheldDocument | null>(null);
  if (!documents?.length) return null;
  const [latest, ...older] = documents;
  const recent = latest.status === "CANCELLED" ? documents : [latest, ...older.filter((d) => d.status !== "CANCELLED")];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 print:hidden">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Smartphone className="size-4" /> Handheld
      </p>
      <div className="space-y-5">
        {recent.slice(0, 5).map((doc) => (
          <div key={doc.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-700">
                <span className="font-mono font-medium">{doc.documentNumber}</span>
                {doc.pickingList && <span className="text-slate-400"> · picking list {doc.pickingList.pickingNumber}</span>}
                {" · "}
                {doc.pickerName}
                {" · sent "}
                {fmtDateTime(doc.sentAt)}
                {doc.sentBy && ` by ${person(doc.sentBy)}`}
                {doc.uploadedAt && ` · uploaded ${fmtDateTime(doc.uploadedAt)}${doc.uploadedBy ? ` by ${person(doc.uploadedBy)}` : ""}`}
              </p>
              <div className="flex items-center gap-2">
                <StatusBadge status={STATUS[doc.status].label} tone={STATUS[doc.status].tone} />
                {doc.status === "SENT" && canWrite && (
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => setCancelling(doc)}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            {doc.status === "SENT" && (
              <p className="mt-2 text-sm text-slate-500">
                {doc.lineCount} line(s) on the handheld. Upload the result with HHDC Link.
              </p>
            )}
            {doc.status === "CANCELLED" && doc.cancelRemark && <p className="mt-2 text-sm text-slate-500">{doc.cancelRemark}</p>}
            {doc.status === "UPLOADED" && <Results doc={doc} />}
          </div>
        ))}
      </div>
      {cancelling && <CancelDialog doc={cancelling} onClose={() => setCancelling(null)} />}
    </div>
  );
}
