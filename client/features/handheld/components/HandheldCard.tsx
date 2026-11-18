"use client";

import { useState } from "react";
import { AlertTriangle, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { StatusBadge, type StatusTone } from "@/components/ui/table-components/StatusBadge";
import { fmtDateTime } from "@/features/stock-transfers/lib/indent-status";
import { cn } from "@/lib/utils";
import { useCancelHandheldDocument, useHandheldDocuments, usePostHandheldResult, useStationState } from "../hooks/use-handheld";
import { SendToHandheldDialog, StationStateLine } from "./SendToHandheldDialog";
import type {
  HandheldDocument,
  HandheldDocumentStatus,
  HandheldShortReason,
  HandheldSourceFilter,
  SendTarget,
} from "../types/handheld.types";

export const SHORT_REASON_LABELS: Record<HandheldShortReason, string> = {
  NOT_FOUND: "Not found",
  DAMAGED: "Damaged",
  LESS_IN_BIN: "Less in bin",
  OTHER: "Other",
};

export const HANDHELD_STATUS: Record<HandheldDocumentStatus, { label: string; tone: StatusTone }> = {
  QUEUED: { label: "Waiting for handheld", tone: "amber" },
  SENT: { label: "On handheld", tone: "blue" },
  RECEIVED: { label: "Finished on handheld", tone: "purple" },
  UPLOADED: { label: "Posted", tone: "emerald" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};

const ACTIVE: HandheldDocumentStatus[] = ["QUEUED", "SENT", "RECEIVED"];
export const isActiveJob = (d: { status: HandheldDocumentStatus }) => ACTIVE.includes(d.status);

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";
const person = (p: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : null);

function CancelDialog({ doc, onClose }: { doc: HandheldDocument; onClose: () => void }) {
  const cancel = useCancelHandheldDocument();
  const [remark, setRemark] = useState("");
  const text =
    doc.status === "QUEUED"
      ? "The job will not go to a handheld."
      : doc.status === "SENT"
        ? "The station takes it off the handheld at the next dock if nothing was entered; entries already made stay on the handheld and are never posted."
        : "The result from the handheld is kept on the job but never posted.";
  return (
    <ModalFame isOpen onClose={onClose} title={`Cancel handheld job ${doc.documentNumber}`}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          {text} {doc.type !== "COUNT_SHEET" && "Reserved stock is not changed."} Send it again to pick, check or count it on a handheld.
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
            {cancel.isPending ? "Cancelling…" : "Cancel job"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}

/** A posted picking or MIT result (what the lines recorded). */
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
        <LinesTable
          receiving={receiving}
          rows={attention.map((l) => ({ ...l, key: l.id, reported: l.quantity !== null }))}
        />
      )}
      {!receiving && attention.some((l) => (l.quantity ?? 0) < l.expectedQuantity) && (
        <p className="text-sm text-slate-500">
          {doc.type === "INDENT_PICK" ? "Short quantities went back to the back order." : "Short quantities went back to free stock."}
        </p>
      )}
      <Notes doc={doc} substitutes={lines.some((l) => l.scannedPartNumber)} extras={extras.map((e) => ({ ...e, quantity: e.quantity ?? 0, note: e.note ?? undefined }))} />
    </div>
  );
}

type Row = {
  key: string;
  partNumber: string;
  partName: string | null;
  binLocation: string | null;
  caseNumber: string | null;
  expectedQuantity: number;
  reported: boolean;
  quantity: number | null;
  damagedQuantity: number;
  shortReason: HandheldShortReason | null;
  scannedPartNumber: string | null;
  note: string | null;
};

function LinesTable({ receiving, rows }: { receiving: boolean; rows: Row[] }) {
  return (
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
          {rows.map((l) => (
            <tr key={l.key} className="border-t border-slate-100">
              <td className={tdCls}>
                <p className="font-mono text-sm font-medium">{l.partNumber}</p>
                {l.partName && <p className="max-w-48 truncate text-sm text-slate-500">{l.partName}</p>}
              </td>
              <td className={cn(tdCls, "font-mono text-sm text-slate-500")}>{(receiving ? l.caseNumber : l.binLocation) ?? "—"}</td>
              <td className={cn(tdCls, "text-right")}>{l.expectedQuantity}</td>
              <td className={cn(tdCls, "text-right font-medium", !l.reported ? "text-slate-400" : (l.quantity ?? 0) < l.expectedQuantity ? "text-amber-700" : "")}>
                {l.reported ? l.quantity : receiving ? "not checked" : "not reported"}
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
  );
}

function Notes({ doc, substitutes, extras }: { doc: HandheldDocument; substitutes: boolean; extras: { partNumber: string; quantity: number; damagedQuantity?: number; note?: string }[] }) {
  return (
    <>
      {substitutes && <p className="text-sm text-slate-500">A scanned substitute is not counted; supply it as an alternate if it should go.</p>}
      {doc.type === "MIT_RECEIVE" && extras.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Not on this MIT (not received into stock):{" "}
            {extras.map((e, i) => (
              <span key={`${e.partNumber}-${i}`}>
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
    </>
  );
}

/** A finished result before it is posted, and the choices only the store can make. */
function ReviewAndPost({ doc, canWrite, onPosted }: { doc: HandheldDocument; canWrite: boolean; onPosted?: (doc: HandheldDocument) => void }) {
  const post = usePostHandheldResult();
  const review = doc.review;
  const [reason, setReason] = useState<HandheldShortReason>("NOT_FOUND");
  const [uncounted, setUncounted] = useState<"ZERO" | "RELEASE" | "">("");
  if (!review) return null;
  const sheet = doc.type === "COUNT_SHEET";
  const receiving = doc.type === "MIT_RECEIVE";
  const lines = review.lines ?? [];
  const unreported = lines.filter((l) => !l.reported);
  const attention = lines.filter((l) => !l.reported || l.quantity !== l.expectedQuantity || l.damagedQuantity > 0 || l.scannedPartNumber || l.note);
  const notCounted = review.notCounted ?? [];
  const needsUncounted = sheet && notCounted.length > 0;
  const ready = !review.problem && (!needsUncounted || uncounted);

  return (
    <div className="mt-3 space-y-3">
      {sheet ? (
        <SheetReview doc={doc} />
      ) : attention.length === 0 ? (
        <p className="text-sm text-emerald-700">
          All {lines.length} line(s) {receiving ? "received as invoiced" : "picked in full"}.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {lines.length - attention.length} of {lines.length} line(s) as expected. These need a look:
          </p>
          <LinesTable receiving={receiving} rows={attention.map((l) => ({ ...l, key: l.lineId }))} />
        </>
      )}
      {!sheet && <Notes doc={doc} substitutes={lines.some((l) => l.scannedPartNumber)} extras={review.extras ?? []} />}

      {review.problem && (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>This result cannot be posted: {review.problem}. Cancel the job and send it again.</span>
        </p>
      )}

      {canWrite && !review.problem && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          {!sheet && !receiving && unreported.length > 0 && (
            <Field label={`The picker did not report ${unreported.length} line(s): they count as not picked, because`}>
              <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value as HandheldShortReason)}>
                {(Object.keys(SHORT_REASON_LABELS) as HandheldShortReason[]).map((r) => (
                  <option key={r} value={r}>
                    {SHORT_REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {needsUncounted && (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-slate-700">{notCounted.length} part(s) on the sheet have no count. What happens to them?</p>
              <label className="flex items-start gap-2">
                <input type="radio" name={`uncounted-${doc.id}`} checked={uncounted === "ZERO"} onChange={() => setUncounted("ZERO")} className="mt-1" />
                <span>
                  <b>ZERO</b>: they were not found; count them as none on hand (this shows as a shortage).
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name={`uncounted-${doc.id}`} checked={uncounted === "RELEASE"} onChange={() => setUncounted("RELEASE")} className="mt-1" />
                <span>
                  <b>RELEASE</b>: not counted yet; put them back so another sheet can count them.
                </span>
              </label>
            </div>
          )}
          <p className="text-sm text-slate-500">
            {sheet
              ? "Posting uploads the counts to the stock taking, once."
              : receiving
                ? "Posting marks the MIT Verified and opens Generate MRN filled in from these counts. Nothing goes into stock until the MRN."
                : doc.type === "INDENT_PICK"
                  ? "Posting drops each reservation to what was picked; the short goes back to the indent's back order."
                  : "Posting drops each reservation to what was picked; the short goes back to free stock."}
          </p>
          <div className="flex justify-end">
            <Button
              disabled={!ready || post.isPending}
              onClick={() =>
                post.mutate(
                  {
                    id: doc.id,
                    ...(sheet ? { uncounted: uncounted || "RELEASE" } : !receiving && unreported.length ? { unreportedReason: reason } : {}),
                  },
                  { onSuccess: (posted) => onPosted?.(posted) },
                )
              }
            >
              {post.isPending ? "Posting…" : "Post"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SheetReview({ doc }: { doc: HandheldDocument }) {
  const entries = doc.review?.entries ?? [];
  const notCounted = doc.review?.notCounted ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {entries.length} count(s) from the handheld, {doc.review?.totals?.quantity ?? 0} pcs
        {doc.review?.totals?.damaged ? `, ${doc.review.totals.damaged} damaged` : ""}.
      </p>
      {entries.length > 0 && (
        <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className={thCls}>Part</th>
                <th className={thCls}>Bin</th>
                <th className={cn(thCls, "text-right")}>Counted</th>
                <th className={cn(thCls, "text-right")}>Damaged</th>
                <th className={thCls}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={`${e.partNumber ?? e.partId}-${e.binLocation}-${i}`} className="border-t border-slate-100">
                  <td className={cn(tdCls, "font-mono")}>
                    {e.partNumber ?? e.partId}
                    {!e.onSheet && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 font-sans text-amber-800">not on the sheet</span>}
                  </td>
                  <td className={cn(tdCls, "font-mono text-slate-500")}>{e.binLocation ?? "—"}</td>
                  <td className={cn(tdCls, "text-right font-medium")}>{e.quantity}</td>
                  <td className={cn(tdCls, "text-right", e.damagedQuantity ? "text-red-600" : "text-slate-300")}>{e.damagedQuantity ?? 0}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">{e.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {notCounted.length > 0 && (
        <p className="text-sm text-slate-600">
          <span className="font-medium text-amber-700">Not counted ({notCounted.length}):</span>{" "}
          {notCounted.slice(0, 30).map((l, i) => (
            <span key={`${l.partNumber}-${i}`}>
              {i > 0 && ", "}
              <span className="font-mono">{l.partNumber}</span>
              {l.binLocation ? ` (${l.binLocation})` : ""}
            </span>
          ))}
          {notCounted.length > 30 && `, and ${notCounted.length - 30} more`}
        </p>
      )}
    </div>
  );
}

function StatusLine({ doc }: { doc: HandheldDocument }) {
  const worker = doc.type === "COUNT_SHEET" ? "checker" : "picker";
  const { data: state } = useStationState(doc.branchId, doc.status === "QUEUED");
  if (doc.status === "QUEUED") {
    return (
      <div className="mt-2 space-y-1">
        <p className="text-sm text-slate-500">
          Waiting for the next handheld docked at {doc.branch.name} ({doc.lineCount} line(s), {worker} {doc.pickerName || "—"}).
        </p>
        <StationStateLine state={state} branchName={doc.branch.name} />
      </div>
    );
  }
  if (doc.status === "SENT") {
    return (
      <p className="mt-2 text-sm text-slate-500">
        On handheld {doc.deliveredDevice?.name ?? "(sent by HHDC Link)"}
        {doc.deliveredStation ? `, ${doc.deliveredStation.name}` : ""} since {fmtDateTime(doc.sentAt)}: {doc.lineCount} line(s) for {worker}{" "}
        {doc.pickerName || "—"}. The result comes back here when the handheld is docked after Finish.
      </p>
    );
  }
  if (doc.status === "CANCELLED") {
    return (
      <p className="mt-2 text-sm text-slate-500">
        {doc.cancelRemark}
        {doc.deviceKeptEntries && " The entries made on the handheld were kept there; they are not posted."}
      </p>
    );
  }
  return null;
}

/**
 * Handheld jobs of a document (indent, CPO, MIT or count sheet): send it to the handheld, follow it
 * (waiting → on handheld → finished → posted), review and post the result. Everything happens on this
 * page; the station on the store PC moves the files while a handheld is docked.
 */
export function HandheldCard({
  filter,
  canWrite,
  send,
  onPosted,
}: {
  filter: HandheldSourceFilter;
  canWrite: boolean;
  /** What can be sent now; null when the document cannot go to a handheld in its state. */
  send?: SendTarget | null;
  onPosted?: (doc: HandheldDocument) => void;
}) {
  const { data: documents } = useHandheldDocuments(filter);
  const [cancelling, setCancelling] = useState<HandheldDocument | null>(null);
  const [sending, setSending] = useState(false);
  const docs = documents ?? [];
  const active = docs.some(isActiveJob);
  const canSend = canWrite && !!send && !active;
  if (!docs.length && !canSend) return null;
  const [latest, ...older] = docs;
  const recent = !latest ? [] : latest.status === "CANCELLED" ? docs : [latest, ...older.filter((d) => d.status !== "CANCELLED")];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 print:hidden">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Smartphone className="size-4" /> Handheld
        </p>
        {canSend && (
          <Button size="sm" className="gap-1.5" onClick={() => setSending(true)}>
            <Send className="size-4" /> Send to handheld
          </Button>
        )}
      </div>
      {!docs.length && <p className="text-sm text-slate-500">Not sent to a handheld yet.</p>}
      <div className="space-y-5">
        {recent.slice(0, 5).map((doc) => (
          <div key={doc.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-700">
                <span className="font-mono font-medium">{doc.documentNumber}</span>
                {doc.pickingList && <span className="text-slate-400"> · picking list {doc.pickingList.pickingNumber}</span>}
                {" · sent "}
                {fmtDateTime(doc.queuedAt)}
                {doc.sentBy && ` by ${person(doc.sentBy)}`}
                {doc.receivedAt && ` · finished ${fmtDateTime(doc.receivedAt)}`}
                {doc.uploadedAt && ` · posted ${fmtDateTime(doc.uploadedAt)}${doc.uploadedBy ? ` by ${person(doc.uploadedBy)}` : ""}`}
              </p>
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={doc.status === "SENT" && doc.deliveredDevice ? `On handheld (${doc.deliveredDevice.name})` : HANDHELD_STATUS[doc.status].label}
                  tone={HANDHELD_STATUS[doc.status].tone}
                />
                {isActiveJob(doc) && canWrite && (
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => setCancelling(doc)}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            <StatusLine doc={doc} />
            {doc.status === "RECEIVED" && <ReviewAndPost doc={doc} canWrite={canWrite} onPosted={onPosted} />}
            {doc.status === "UPLOADED" && doc.type !== "COUNT_SHEET" && <Results doc={doc} />}
            {doc.status === "UPLOADED" && doc.type === "COUNT_SHEET" && (
              <p className="mt-2 text-sm text-emerald-700">The counts are on the stock taking.</p>
            )}
          </div>
        ))}
      </div>
      {cancelling && <CancelDialog doc={cancelling} onClose={() => setCancelling(null)} />}
      {sending && send && <SendToHandheldDialog target={send} onClose={() => setSending(false)} />}
    </div>
  );
}
