"use client";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Plus, Printer, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DetailField } from "@/features/part-sale/components/OrderDetail";
import { PartPicker, type PartSearchQuery } from "@/features/stock-transfers/components/PartPicker";
import { searchStockTakePartsRequest, stockTakeKeys } from "../api/stock-taking.api";
import { useCountSheet, useUploadSheet } from "../hooks/use-stock-taking";
import { KINDS, fmtDateTime, kindOf, sheetIsOpen, sheetStatus, toCount, userName } from "../lib/stock-taking-format";
import type { CountEntry, Kind } from "../types/stock-taking.types";

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";
const qtyCls = cn(inputCls, "ml-auto h-9 w-20 text-right");

type Entry = { qty: string; damaged: string; bin: string; remarks: string };
type Extra = Entry & { key: string; partId?: string; partNumber: string; name: string };

const blank = (e?: Partial<Entry>) => !e || (!e.qty?.trim() && !e.damaged?.trim());

/**
 * Count entry for one sheet: the stand-in for the handheld (HHDC) until it is integrated. The device
 * will upload the same entries: one per part per bin.
 */
export function CountSheetForm({ id, sheetId, kind = "COUNT" }: { id: string; sheetId: string; kind?: Kind }) {
  const router = useRouter();
  const { data: sheet, isLoading, error } = useCountSheet(id, sheetId);
  const upload = useUploadSheet(id, sheetId);
  const { hasPermission } = useAuth();
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [extras, setExtras] = useState<Extra[]>([]);
  const [unknown, setUnknown] = useState("");
  const [find, setFind] = useState("");
  const [asking, setAsking] = useState(false);

  const lines = useMemo(() => sheet?.lines ?? [], [sheet]);
  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q
      ? lines.filter((l) => l.partNumber.toLowerCase().includes(q) || (l.part?.name ?? "").toLowerCase().includes(q) || (l.binLocation ?? "").toLowerCase().includes(q))
      : lines;
  }, [lines, find]);

  if (isLoading) {
    return <LoadingSkeleton variant="detail" />;
  }
  if (error || !sheet) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href={`${KINDS[kind].base}/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to the {KINDS[kind].noun}
        </Link>
        <p className="text-sm text-red-500">Count sheet not found, or you do not have access to it.</p>
      </div>
    );
  }

  const k = KINDS[kindOf(sheet.stockTake.type)];
  const editable = sheetIsOpen(sheet) && sheet.stockTake.status === "ACTIVE" && hasPermission(k.permissions.MANAGE);
  const status = sheetStatus(sheet);
  const entryFor = (lineId: string, bin: string | null): Entry => entries[lineId] ?? { qty: "", damaged: "", bin: bin ?? "", remarks: "" };
  const setEntry = (lineId: string, bin: string | null, patch: Partial<Entry>) =>
    setEntries((prev) => ({ ...prev, [lineId]: { ...entryFor(lineId, bin), ...patch } }));
  const setExtra = (key: string, patch: Partial<Extra>) => setExtras((prev) => prev.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const blanks = lines.filter((l) => blank(entries[l.id])).length;
  const invalid =
    lines.some((l) => !blank(entries[l.id]) && !valid(entries[l.id])) || extras.some((x) => blank(x) || !valid(x));
  const searchQuery: PartSearchQuery = (search) => ({
    queryKey: stockTakeKeys.parts(search, sheet.stockTake.branchId),
    queryFn: () => searchStockTakePartsRequest(search, sheet.stockTake.branchId),
  });

  function valid(e: Entry) {
    return (e.qty.trim() === "" || toCount(e.qty) != null) && (e.damaged.trim() === "" || toCount(e.damaged) != null);
  }

  function toEntry(e: Entry, part: { partId?: string | null; partNumber: string }): CountEntry {
    return {
      ...(part.partId ? { partId: part.partId } : { partNumber: part.partNumber }),
      binLocation: e.bin.trim() || undefined,
      quantity: toCount(e.qty) ?? 0,
      damagedQuantity: toCount(e.damaged) ?? 0,
      remarks: e.remarks.trim() || undefined,
    };
  }

  function submit(uncounted: "ZERO" | "RELEASE") {
    const payload = [
      ...lines.filter((l) => !blank(entries[l.id])).map((l) => toEntry(entries[l.id], l)),
      ...extras.map((x) => toEntry(x, x)),
    ];
    upload.mutate({ entries: payload, uncounted }, { onSuccess: () => router.push(`${k.base}/${id}`) });
  }

  // Legacy "Replicate Computer Stock in Physical Qty": start from system stock and change what differs.
  function replicate() {
    setEntries((prev) => {
      const next = { ...prev };
      for (const l of lines) if (blank(prev[l.id])) next[l.id] = { ...entryFor(l.id, l.binLocation), qty: String(l.systemStock) };
      return next;
    });
  }

  // Also for a part on the sheet found in a second bin: both counts add up.
  function addExtra(part: { partId?: string; partNumber: string; name: string }) {
    setExtras((prev) => [...prev, { key: `${part.partId ?? part.partNumber}-${Date.now()}`, ...part, qty: "", damaged: "", bin: "", remarks: "" }]);
  }

  return (
    <div className="px-4 py-6 lg:px-6 print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`${k.base}/${id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to {sheet.stockTake.batchNumber}
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-4" /> Print sheet
          </Button>
          {editable && sheet.showSystemStock && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={replicate}>
              <Copy className="size-4" /> Fill blanks with system stock
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                Count sheet · {sheet.stockTake.batchNumber} · {sheet.stockTake.branch.name}
              </p>
              <h1 className="font-mono text-xl font-semibold text-slate-800">{sheet.sheetNumber}</h1>
            </div>
            <StatusBadge status={status.label} tone={status.tone} />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <DetailField label="Checker" value={userName(sheet.checker) || null} />
            <DetailField label="Selection" value={sheet.criteria} />
            <DetailField label="Issued" value={`${fmtDateTime(sheet.issuedAt)} · ${userName(sheet.issuedBy)}`} />
            <DetailField label="Parts" value={sheet.lineCount} />
            {sheet.uploadedAt && <DetailField label="Uploaded" value={`${fmtDateTime(sheet.uploadedAt)} · ${userName(sheet.uploadedBy)}`} />}
            {sheet.cancelRemark && <DetailField wide label="Cancelled" value={sheet.cancelRemark} />}
          </div>
          {editable && (
            <p className="mt-4 text-sm text-muted-foreground print:hidden">
              Enter what is on the shelf: good and damaged quantities, and the bin the part was found in. Leave a part blank if it was not
              counted. Add any part found that is not on the sheet.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <input className={cn(inputCls, "w-full sm:w-80")} placeholder="Find part, description or bin…" value={find} onChange={(e) => setFind(e.target.value)} />
            {editable && <p className="text-sm text-slate-600">{lines.length - blanks} of {lines.length} entered</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>Bin</th>
                  <th className={thCls}>Part</th>
                  <th className={thCls}>Description</th>
                  {sheet.showSystemStock && <th className={cn(thCls, "text-right")}>System</th>}
                  <th className={cn(thCls, "text-right")}>Good qty</th>
                  <th className={cn(thCls, "text-right")}>Damaged</th>
                  <th className={thCls}>Found in bin</th>
                  <th className={thCls}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => {
                  const e = entryFor(l.id, l.binLocation);
                  return (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className={cn(tdCls, "font-mono text-slate-500")}>{l.binLocation ?? "—"}</td>
                      <td className={cn(tdCls, "font-mono font-medium")}>{l.partNumber}</td>
                      <td className={cn(tdCls, "max-w-56 truncate")}>{l.part?.name ?? ""}</td>
                      {sheet.showSystemStock && <td className={cn(tdCls, "text-right text-slate-500")}>{l.systemStock}</td>}
                      {editable ? (
                        <>
                          <td className={cn(tdCls, "text-right")}>
                            <input type="number" min={0} inputMode="numeric" className={qtyCls} value={e.qty} onChange={(ev) => setEntry(l.id, l.binLocation, { qty: ev.target.value })} />
                          </td>
                          <td className={cn(tdCls, "text-right")}>
                            <input type="number" min={0} inputMode="numeric" className={qtyCls} value={e.damaged} onChange={(ev) => setEntry(l.id, l.binLocation, { damaged: ev.target.value })} />
                          </td>
                          <td className={tdCls}>
                            <input className={cn(inputCls, "h-9 w-32 font-mono")} maxLength={40} value={e.bin} onChange={(ev) => setEntry(l.id, l.binLocation, { bin: ev.target.value })} />
                          </td>
                          <td className={tdCls}>
                            <input className={cn(inputCls, "h-9 w-44")} maxLength={200} value={e.remarks} onChange={(ev) => setEntry(l.id, l.binLocation, { remarks: ev.target.value })} />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className={cn(tdCls, "text-right")}>{l.countedQuantity ?? ""}</td>
                          <td className={cn(tdCls, "text-right")}>{l.countedQuantity != null ? l.damagedQuantity : ""}</td>
                          <td className={cn(tdCls, "font-mono text-slate-500")}>{l.countedBins ?? ""}</td>
                          <td className={cn(tdCls, "text-slate-500")}>{l.remarks ?? ""}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {extras.map((x) => (
                  <tr key={x.key} className="border-t border-amber-100 bg-amber-50/40">
                    <td className={cn(tdCls, "text-xs text-amber-700")}>Found</td>
                    <td className={cn(tdCls, "font-mono font-medium")}>{x.partNumber}</td>
                    <td className={cn(tdCls, "max-w-56 truncate")}>{x.name || <span className="text-red-600">Not in Part Master</span>}</td>
                    {sheet.showSystemStock && <td />}
                    <td className={cn(tdCls, "text-right")}>
                      <input type="number" min={0} inputMode="numeric" className={qtyCls} value={x.qty} onChange={(ev) => setExtra(x.key, { qty: ev.target.value })} />
                    </td>
                    <td className={cn(tdCls, "text-right")}>
                      <input type="number" min={0} inputMode="numeric" className={qtyCls} value={x.damaged} onChange={(ev) => setExtra(x.key, { damaged: ev.target.value })} />
                    </td>
                    <td className={tdCls}>
                      <input className={cn(inputCls, "h-9 w-32 font-mono")} maxLength={40} value={x.bin} onChange={(ev) => setExtra(x.key, { bin: ev.target.value })} />
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-1">
                        <input className={cn(inputCls, "h-9 w-36")} maxLength={200} value={x.remarks} onChange={(ev) => setExtra(x.key, { remarks: ev.target.value })} />
                        <button
                          type="button"
                          onClick={() => setExtras((prev) => prev.filter((y) => y.key !== x.key))}
                          className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove part"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editable && (
            <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 print:hidden lg:grid-cols-2">
              <Field label="Found a part not on this sheet?">
                <PartPicker
                  searchQuery={searchQuery}
                  placeholder="Search part number or name…"
                  onSelect={(p) => addExtra({ partId: p.id, partNumber: p.partNumber, name: p.name })}
                />
              </Field>
              <Field label="Part number not in Part Master">
                <div className="flex gap-2">
                  <input className={inputCls} maxLength={40} value={unknown} onChange={(e) => setUnknown(e.target.value)} />
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!unknown.trim()}
                    onClick={() => {
                      addExtra({ partNumber: unknown.trim().toUpperCase(), name: "" });
                      setUnknown("");
                    }}
                  >
                    <Plus className="size-4" /> Add
                  </Button>
                </div>
              </Field>
            </div>
          )}
        </div>

        {editable && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
            <p className="text-sm text-slate-600">
              {invalid ? <span className="text-red-600">Quantities must be whole numbers, and each added part needs a count.</span> : `${blanks} part(s) left blank`}
            </p>
            <Button className="gap-1.5" disabled={invalid || upload.isPending} onClick={() => (blanks ? setAsking(true) : submit("RELEASE"))}>
              <Upload className="size-4" /> {upload.isPending ? "Uploading…" : "Upload counts"}
            </Button>
          </div>
        )}
      </div>

      {asking && (
        <ModalFame isOpen onClose={() => setAsking(false)} title="Parts left blank">
          <div className="grid gap-4 text-sm text-slate-700">
            <p>{blanks} part(s) on this sheet have no count. What should happen to them?</p>
            <div className="grid gap-2">
              <Button
                variant="outline"
                disabled={upload.isPending}
                onClick={() => {
                  setAsking(false);
                  submit("ZERO");
                }}
              >
                None on hand: count them as zero
              </Button>
              <Button
                variant="outline"
                disabled={upload.isPending}
                onClick={() => {
                  setAsking(false);
                  submit("RELEASE");
                }}
              >
                Not counted: leave them for another sheet
              </Button>
            </div>
          </div>
        </ModalFame>
      )}
    </div>
  );
}
