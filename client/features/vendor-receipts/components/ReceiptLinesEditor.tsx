"use client";

import { useEffect, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { inputCls } from "@/components/forms/FormField";
import { NumberInput } from "@/components/forms/NumberInput";
import { fmtNaira } from "@/features/mobis-receipts/lib/mobis-labels";
import { useReceivableParts } from "../hooks/use-vendor-receipts";
import { MRN_TAX_FORM_LABELS, mrnTotals, round2 } from "../lib/mrn-calc";
import type { MrnTaxForm, ReceivablePart } from "../types/vendor-receipt.types";

/** What a line needs to know about its part record. */
export type EditorPart = Pick<ReceivablePart, "id" | "partNumber" | "name" | "partFlag" | "sourceLabel" | "taxable" | "unitPrice">;
export type EditorLine = { part: EditorPart; quantity: number; unitPrice: number; returned?: number };

/** Branch-bought records take the received cost as their dealer rate; Mobis records keep Finance's price. */
export const repriced = (partFlag: string) => ["L", "U", "R"].includes(partFlag);

export function useDebounced(value: string, ms = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function PartSearch({ branchId, exclude, onAdd }: { branchId: string; exclude: string[]; onAdd: (part: ReceivablePart) => void }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const query = useReceivableParts(branchId, debounced);
  return (
    <div className="grid gap-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <input
          className={`${inputCls} pl-9`}
          value={search}
          placeholder={branchId ? "Part number or name (at least 2 characters)" : "Choose the branch first"}
          disabled={!branchId}
          aria-label="Search parts to receive"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {debounced.length >= 2 &&
        (query.isFetching ? (
          <p role="status" className="text-xs text-muted-foreground">Searching parts...</p>
        ) : query.isError ? (
          <p role="alert" className="text-xs text-destructive">Part search failed.</p>
        ) : !query.data?.length ? (
          <p className="text-xs text-muted-foreground">No active parts match. Add the local, used or repaired record on the part&apos;s page first.</p>
        ) : (
          <ul className="max-h-56 overflow-y-auto rounded-md border" aria-label="Matching parts">
            {query.data.map((part) => (
              <li key={part.id}>
                <button
                  type="button"
                  disabled={exclude.includes(part.id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b px-3 py-2 text-left last:border-0 hover:bg-muted/50 disabled:opacity-50"
                  onClick={() => {
                    onAdd(part);
                    setSearch("");
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      <span className="font-mono">{part.partNumber}</span> · {part.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {part.sourceLabel}
                      {part.sourceOfPart ? ` of ${part.sourceOfPart.partNumber}` : ""} · Dealer {fmtNaira(part.unitPrice)}
                      {part.bin ? ` · Bin ${part.bin}` : ""}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{part.stock} in stock</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

/**
 * The part lines of a vendor MRN with the tax form's VAT, the round-off and the amount payable.
 * Used to post a new MRN and to correct one.
 */
export function ReceiptLinesEditor({
  branchId,
  lines,
  onChange,
  taxForm,
  conversionRate,
  roundToNaira,
}: {
  branchId: string;
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  taxForm: MrnTaxForm;
  conversionRate: number;
  roundToNaira: boolean;
}) {
  const foreign = conversionRate !== 1;
  const totals = mrnTotals(lines.map((l) => ({ ...l, taxable: l.part.taxable })), taxForm, conversionRate || 0, roundToNaira);
  const setLine = (index: number, patch: Partial<EditorLine>) => onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  return (
    <div className="grid gap-3">
      <PartSearch
        branchId={branchId}
        exclude={lines.map((l) => l.part.id)}
        onAdd={(part) => onChange([...lines, { part, quantity: 1, unitPrice: foreign ? 0 : part.unitPrice }])}
      />
      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Part</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">{foreign ? "Invoice price" : "Unit price (₦)"}</th>
                <th className="px-3 py-2 text-right">Amount (₦)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const cost = round2(round2(line.unitPrice) * (conversionRate || 0));
                return (
                  <tr key={line.part.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">
                      <span className="font-mono font-medium">{line.part.partNumber}</span>
                      <span className="block text-xs text-muted-foreground">{line.part.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {repriced(line.part.partFlag) ? "Dealer rate will be set to this cost" : `Keeps its dealer rate ${fmtNaira(line.part.unitPrice)}`}
                        {!line.part.taxable && " · non-taxable"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{line.part.sourceLabel}</td>
                    <td className="px-3 py-2">
                      <NumberInput
                        min={String(Math.max(line.returned ?? 0, 1))}
                        step="1"
                        aria-label={`Quantity of ${line.part.partNumber}`}
                        className={`${inputCls} h-8 w-20`}
                        value={line.quantity}
                        onValueChange={(v) => setLine(index, { quantity: v ?? 0 })}
                      />
                      {!!line.returned && <span className="block text-xs text-muted-foreground">{line.returned} returned</span>}
                    </td>
                    <td className="px-3 py-2">
                      <NumberInput
                        min="0.01"
                        step="0.01"
                        aria-label={`Unit price of ${line.part.partNumber}`}
                        className={`${inputCls} h-8 w-32`}
                        value={line.unitPrice}
                        onValueChange={(v) => setLine(index, { unitPrice: v ?? 0 })}
                      />
                      {foreign && <span className="block text-xs text-muted-foreground">= {fmtNaira(cost)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(round2(cost * line.quantity))}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        aria-label={`Remove ${line.part.partNumber}`}
                        disabled={!!line.returned}
                        title={line.returned ? "Part of this line went back to the vendor" : undefined}
                        className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
                        onClick={() => onChange(lines.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="border-t">
                <td colSpan={4} className="px-3 py-1.5 text-right">Goods value</td>
                <td className="px-3 py-1.5 text-right">{fmtNaira(totals.totalValue)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} className="px-3 py-1.5 text-right">VAT ({MRN_TAX_FORM_LABELS[taxForm].split(" · ")[0]})</td>
                <td className="px-3 py-1.5 text-right">{fmtNaira(totals.taxAmount)}</td>
                <td />
              </tr>
              {roundToNaira && (
                <tr>
                  <td colSpan={4} className="px-3 py-1.5 text-right">Round off</td>
                  <td className="px-3 py-1.5 text-right">{totals.roundOff.toFixed(2)}</td>
                  <td />
                </tr>
              )}
              <tr className="border-t">
                <td colSpan={4} className="px-3 py-2 text-right font-semibold">Net purchase amount</td>
                <td className="px-3 py-2 text-right font-semibold">{fmtNaira(totals.netAmount)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/** Tax form dropdown (legacy, chosen per MRN). */
export function TaxFormSelect({ value, onChange }: { value: MrnTaxForm; onChange: (form: MrnTaxForm) => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as MrnTaxForm)} aria-label="Tax form">
      {(Object.keys(MRN_TAX_FORM_LABELS) as MrnTaxForm[]).map((code) => (
        <option key={code} value={code}>
          {MRN_TAX_FORM_LABELS[code]}
        </option>
      ))}
    </select>
  );
}
