"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { PartPicker, type PartSearchQuery } from "@/features/stock-transfers/components/PartPicker";
import type { PartSearchResult } from "@/features/stock-transfers/types/indent.types";
import { searchStockTakePartsRequest, stockTakeKeys } from "../api/stock-taking.api";
import {
  useBinProposals,
  useCheckers,
  useCompleteStockTake,
  useConfirmStockTake,
  useCorrectLine,
  useCreateSheet,
  useRecordCounts,
  useUpdateBins,
} from "../hooks/use-stock-taking";
import { fmtCurrency, toCount } from "../lib/stock-taking-format";
import type { Basis, StockTake, StockTakeLine } from "../types/stock-taking.types";

type Close = { onClose: () => void };

function Actions({ onClose, children }: Close & { children: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={onClose}>
        Close
      </Button>
      {children}
    </div>
  );
}

/** A reason, then a destructive action: cancelling a stock taking or a count sheet. */
export function RemarkDialog({
  title,
  description,
  action,
  pending,
  onSubmit,
  onClose,
}: Close & { title: string; description: string; action: string; pending: boolean; onSubmit: (remark: string) => void }) {
  const [remark, setRemark] = useState("");
  return (
    <ModalFame isOpen onClose={onClose} title={title}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">{description}</p>
        <Field label="Reason">
          <input className={inputCls} maxLength={500} value={remark} onChange={(e) => setRemark(e.target.value)} />
        </Field>
        <Actions onClose={onClose}>
          <Button variant="destructive" disabled={!remark.trim() || pending} onClick={() => onSubmit(remark.trim())}>
            {pending ? "Cancelling…" : action}
          </Button>
        </Actions>
      </div>
    </ModalFame>
  );
}

/** Legacy HHDC download: give a checker a range of parts to count. */
export function NewSheetDialog({ take, onClose, onIssued }: Close & { take: StockTake; onIssued: (sheetId: string) => void }) {
  const create = useCreateSheet(take.id);
  const { data: checkers = [] } = useCheckers(take.branchId);
  const [checkerId, setCheckerId] = useState("");
  const [basis, setBasis] = useState<Basis>("BIN");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [uncountedOnly, setUncountedOnly] = useState(true);
  const [showSystemStock, setShowSystemStock] = useState(false);
  return (
    <ModalFame isOpen onClose={onClose} title="Issue a count sheet">
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          The sheet lists the parts for one checker to count. Parts already on another open sheet are left out.
        </p>
        <Field label="Checker">
          <select className={inputCls} value={checkerId} onChange={(e) => setCheckerId(e.target.value)}>
            <option value="">Select checker</option>
            {checkers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-4 text-sm text-slate-700">
          {(["BIN", "PART"] as const).map((b) => (
            <label key={b} className="flex items-center gap-2">
              <input type="radio" className="size-4" checked={basis === b} onChange={() => setBasis(b)} />
              {b === "BIN" ? "Bin location" : "Part number"}
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={basis === "BIN" ? "Bin from" : "Part from"}>
            <input className={inputCls} maxLength={40} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Blank for the first" />
          </Field>
          <Field label="To">
            <input className={inputCls} maxLength={40} value={to} onChange={(e) => setTo(e.target.value)} placeholder="Blank for the last" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="size-4" checked={uncountedOnly} onChange={(e) => setUncountedOnly(e.target.checked)} />
          Only parts not counted yet
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="size-4" checked={showSystemStock} onChange={(e) => setShowSystemStock(e.target.checked)} />
          Show system stock to the checker
        </label>
        <Actions onClose={onClose}>
          <Button
            disabled={!checkerId || create.isPending}
            onClick={() =>
              create.mutate(
                { checkerId, basis, from: from.trim() || undefined, to: to.trim() || undefined, uncountedOnly, showSystemStock },
                { onSuccess: (sheet) => onIssued(sheet.id) },
              )
            }
          >
            {create.isPending ? "Issuing…" : "Issue sheet"}
          </Button>
        </Actions>
      </div>
    </ModalFame>
  );
}

/** Count entered on the count screen without a sheet (legacy manual entry). */
export function AddCountDialog({ take, onClose }: Close & { take: StockTake }) {
  const record = useRecordCounts(take.id);
  const [part, setPart] = useState<PartSearchResult | null>(null);
  const [unknown, setUnknown] = useState("");
  const [bin, setBin] = useState("");
  const [qty, setQty] = useState("");
  const [damaged, setDamaged] = useState("0");
  const [remarks, setRemarks] = useState("");
  const searchQuery: PartSearchQuery = (search) => ({
    queryKey: stockTakeKeys.parts(search, take.branchId),
    queryFn: () => searchStockTakePartsRequest(search, take.branchId),
  });
  const quantity = toCount(qty);
  const damagedQuantity = toCount(damaged);
  const ready = (part || unknown.trim()) && quantity != null && damagedQuantity != null;
  return (
    <ModalFame isOpen onClose={onClose} title="Add a count">
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          Adds to what is already counted for the part. A part not in this count joins it; a part number not in Part Master is kept for
          you to create or set aside.
        </p>
        {part ? (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
            <span>
              <span className="font-mono font-medium">{part.partNumber}</span> · {part.name}
            </span>
            <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => setPart(null)}>
              Change
            </button>
          </div>
        ) : (
          <>
            <Field label="Part">
              <PartPicker onSelect={setPart} searchQuery={searchQuery} placeholder="Search part number or name…" />
            </Field>
            <Field label="Or a part number not in Part Master">
              <input className={inputCls} maxLength={40} value={unknown} onChange={(e) => setUnknown(e.target.value)} />
            </Field>
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Found in bin">
            <input className={inputCls} maxLength={40} value={bin} onChange={(e) => setBin(e.target.value)} />
          </Field>
          <Field label="Good qty">
            <input type="number" min={0} className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Damaged qty">
            <input type="number" min={0} className={inputCls} value={damaged} onChange={(e) => setDamaged(e.target.value)} />
          </Field>
        </div>
        <Field label="Remarks (optional)">
          <input className={inputCls} maxLength={200} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
        <Actions onClose={onClose}>
          <Button
            disabled={!ready || record.isPending}
            onClick={() =>
              record.mutate(
                [
                  {
                    ...(part ? { partId: part.id } : { partNumber: unknown.trim() }),
                    binLocation: bin.trim() || undefined,
                    quantity: quantity!,
                    damagedQuantity: damagedQuantity!,
                    remarks: remarks.trim() || undefined,
                  },
                ],
                { onSuccess: onClose },
              )
            }
          >
            {record.isPending ? "Saving…" : "Add count"}
          </Button>
        </Actions>
      </div>
    </ModalFame>
  );
}

/** Legacy Edit on the upload screen: set the counted quantities; the change is logged. */
export function CorrectLineDialog({ take, line, onClose }: Close & { take: StockTake; line: StockTakeLine }) {
  const correct = useCorrectLine(take.id);
  const [qty, setQty] = useState(line.countedQuantity?.toString() ?? "");
  const [damaged, setDamaged] = useState(String(line.damagedQuantity));
  const [remarks, setRemarks] = useState(line.remarks ?? "");
  const quantity = toCount(qty);
  const damagedQuantity = toCount(damaged);
  return (
    <ModalFame isOpen onClose={onClose} title={`Correct count · ${line.partNumber}`}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          {line.part?.name ?? "Not in Part Master"} · counted so far {line.countedQuantity ?? "nothing"}
          {line.damagedQuantity ? ` + ${line.damagedQuantity} damaged` : ""}. The new figures replace the count; the change is kept in the
          count history.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Good qty">
            <input type="number" min={0} className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Damaged qty">
            <input type="number" min={0} className={inputCls} value={damaged} onChange={(e) => setDamaged(e.target.value)} />
          </Field>
        </div>
        <Field label="Remarks">
          <input className={inputCls} maxLength={200} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Recounted" />
        </Field>
        <Actions onClose={onClose}>
          <Button
            disabled={quantity == null || damagedQuantity == null || correct.isPending}
            onClick={() =>
              correct.mutate(
                { lineId: line.id, countedQuantity: quantity!, damagedQuantity: damagedQuantity!, remarks: remarks.trim() || undefined },
                { onSuccess: onClose },
              )
            }
          >
            {correct.isPending ? "Saving…" : "Save"}
          </Button>
        </Actions>
      </div>
    </ModalFame>
  );
}

export function CompleteDialog({ take, onClose }: Close & { take: StockTake }) {
  const complete = useCompleteStockTake(take.id);
  const { uncounted, unknown } = take.summary;
  const [rule, setRule] = useState<"ZERO" | "REMOVE">("ZERO");
  return (
    <ModalFame isOpen onClose={onClose} title={`Complete stock taking ${take.batchNumber}`}>
      <div className="grid gap-4 text-sm text-slate-700">
        <p>No more counts can be uploaded or corrected once the count is completed.{take.type === "ANNUAL" && " The stock of its parts is free to move again."}</p>
        {unknown > 0 && (
          <p className="rounded-lg bg-red-50 p-3 text-red-700">
            {unknown} counted part number(s) are not in Part Master. Create them in Part Master, or mark them not required, first.
          </p>
        )}
        {uncounted > 0 && (
          <div className="grid gap-2 rounded-lg bg-amber-50 p-3 text-amber-800">
            <p>{uncounted} part(s) have not been counted. For these parts:</p>
            <label className="flex items-center gap-2">
              <input type="radio" className="size-4" checked={rule === "ZERO"} onChange={() => setRule("ZERO")} />
              None on hand: they count as shortage
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" className="size-4" checked={rule === "REMOVE"} onChange={() => setRule("REMOVE")} />
              Remove them from this count
            </label>
          </div>
        )}
        <Actions onClose={onClose}>
          <Button disabled={complete.isPending} onClick={() => complete.mutate(uncounted ? rule : undefined, { onSuccess: onClose })}>
            {complete.isPending ? "Completing…" : "Complete"}
          </Button>
        </Actions>
      </div>
    </ModalFame>
  );
}

/** Legacy S/E Confirmation: from here the discrepancy is posted to stock. */
export function ConfirmDialog({ take, onClose }: Close & { take: StockTake }) {
  const confirm = useConfirmStockTake(take.id);
  const s = take.summary;
  return (
    <ModalFame isOpen onClose={onClose} title={`Confirm shortage and excess · ${take.batchNumber}`}>
      <div className="grid gap-4 text-sm text-slate-700">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-emerald-50 p-3 text-emerald-800">
            <p className="text-xs font-medium uppercase tracking-wider">Excess</p>
            <p className="text-lg font-semibold">{s.excessQuantity} units</p>
            <p>{fmtCurrency(s.excessValue)}</p>
          </div>
          <div className="rounded-lg bg-red-50 p-3 text-red-800">
            <p className="text-xs font-medium uppercase tracking-wider">Shortage</p>
            <p className="text-lg font-semibold">{s.shortageQuantity} units</p>
            <p>{fmtCurrency(s.shortageValue)}</p>
          </div>
        </div>
        <p>
          Stock at {take.branch.name} will be adjusted for the {s.discrepancies} part(s) with a discrepancy. Each adjustment is recorded as a SAN
          against this count and cannot be undone.
        </p>
        <Actions onClose={onClose}>
          <Button disabled={confirm.isPending} onClick={() => confirm.mutate(undefined, { onSuccess: onClose })}>
            {confirm.isPending ? "Confirming…" : "Confirm and adjust stock"}
          </Button>
        </Actions>
      </div>
    </ModalFame>
  );
}

/** Legacy Bin Location Updation: where each part was found, editable, then saved to the branch bins. */
export function BinUpdateDialog({ take, onClose }: Close & { take: StockTake }) {
  const { data: proposals, isLoading } = useBinProposals(take.id, true);
  const update = useUpdateBins(take.id);
  const [bins, setBins] = useState<Record<string, string>>({});
  const [skip, setSkip] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (proposals) setBins(Object.fromEntries(proposals.map((p) => [p.lineId, p.countedBins])));
  }, [proposals]);

  const lines = (proposals ?? []).filter((p) => !skip.has(p.lineId) && bins[p.lineId]?.trim());
  return (
    <ModalFame isOpen onClose={onClose} title={`Update bin locations · ${take.batchNumber}`}>
      <div className="grid gap-4 text-sm text-slate-700">
        <p>Parts found in a bin other than the one on record. Edit the bin to keep, untick any to leave as it is. This can be done once per count.</p>
        {isLoading ? (
          <Loader2 className="mx-auto size-5 animate-spin text-slate-400" />
        ) : !proposals?.length ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-muted-foreground">Every part was found in its recorded bin.</p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  <th className="px-2 py-2" />
                  <th className="px-2 py-2">Part</th>
                  <th className="px-2 py-2">On record</th>
                  <th className="px-2 py-2">New bin</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.lineId} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={!skip.has(p.lineId)}
                        onChange={() =>
                          setSkip((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.lineId)) next.delete(p.lineId);
                            else next.add(p.lineId);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="font-mono font-medium">{p.partNumber}</span>
                      <span className="block text-slate-500">{p.name}</span>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-slate-500">{p.currentBin ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <input
                        className={cn(inputCls, "h-9 w-40 font-mono")}
                        maxLength={40}
                        value={bins[p.lineId] ?? ""}
                        onChange={(e) => setBins((prev) => ({ ...prev, [p.lineId]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Actions onClose={onClose}>
          <Button
            disabled={!lines.length || update.isPending}
            onClick={() => update.mutate(lines.map((p) => ({ lineId: p.lineId, binLocation: bins[p.lineId].trim() })), { onSuccess: onClose })}
          >
            {update.isPending ? "Updating…" : `Update ${lines.length} bin location(s)`}
          </Button>
        </Actions>
      </div>
    </ModalFame>
  );
}
