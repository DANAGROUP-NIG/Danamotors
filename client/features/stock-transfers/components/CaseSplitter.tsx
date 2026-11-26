"use client";

import { useId, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { NumberInput } from "@/components/forms/NumberInput";
import { cn } from "@/lib/utils";
import { useHandheldPickers } from "@/features/handheld";

const numCls = cn(inputCls, "ml-auto h-9 w-16 text-right");
const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400";
const tdCls = "px-3 py-2 align-top";

/** A part being shipped: `key` is the picking line (indent) or the part (direct STN). */
export type CaseRow = { key: string; label: ReactNode; quantity: number };

export type CaseSplitState = { on: boolean; count: number; grid: Record<string, string[]>; weights: string[] };
export const NO_SPLIT: CaseSplitState = { on: false, count: 2, grid: {}, weights: [] };

const toQty = (v: string) => {
  const n = Number(v || "0");
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

/** What case `c` holds of a row; the first case starts with everything. */
const cellOf = (state: CaseSplitState, row: CaseRow, c: number) => state.grid[row.key]?.[c] ?? (c === 0 ? String(row.quantity) : "");

/**
 * The cases to send, or an error. Left unsplit, nothing is sent and the server packs one case
 * (legacy: one case on 99.5% of CPD STNs).
 */
export function caseSplitPlan(state: CaseSplitState, rows: CaseRow[]) {
  if (!state.on) return { cases: undefined, error: null };
  const shipping = rows.filter((r) => r.quantity > 0);
  const sum = (row: CaseRow) => Array.from({ length: state.count }, (_, c) => toQty(cellOf(state, row, c))).reduce((a, b) => a + b, 0);
  if (shipping.some((r) => sum(r) !== r.quantity)) return { cases: undefined, error: "Each part's cases must add up to the quantity shipped." };
  const cases = Array.from({ length: state.count }, (_, c) => ({
    weight: state.weights[c] ? Number(state.weights[c]) : undefined,
    lines: shipping.map((r) => ({ key: r.key, quantity: toQty(cellOf(state, r, c)) })).filter((l) => l.quantity > 0),
  }));
  if (cases.some((c) => c.lines.length === 0)) return { cases: undefined, error: "Every case needs at least one part." };
  return { cases, error: null };
}

/** Legacy Case Creation for STN: split what ships into several cases, with a weight for each. */
export function CaseSplitter({
  rows,
  value,
  onChange,
}: {
  rows: CaseRow[];
  value: CaseSplitState;
  onChange: (v: CaseSplitState) => void;
}) {
  const shipping = rows.filter((r) => r.quantity > 0);
  const { error } = caseSplitPlan(value, rows);
  const setCell = (row: CaseRow, c: number, v: string) => {
    const next = Array.from({ length: value.count }, (_, i) => cellOf(value, row, i));
    next[c] = v;
    onChange({ ...value, grid: { ...value.grid, [row.key]: next } });
  };
  const sumOf = (row: CaseRow) => Array.from({ length: value.count }, (_, c) => toQty(cellOf(value, row, c)) || 0).reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={value.on} onChange={(e) => onChange({ ...value, on: e.target.checked })} />
        Split into several cases
      </label>
      {!value.on ? (
        <p className="mt-1 text-sm text-muted-foreground">Everything will be packed into one case.</p>
      ) : (
        <div className="mt-3 grid gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span>Cases</span>
            <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => onChange({ ...value, count: Math.max(2, value.count - 1) })}>
              <Minus className="size-3.5" />
            </Button>
            <span className="w-6 text-center font-medium">{value.count}</span>
            <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => onChange({ ...value, count: Math.min(20, value.count + 1) })}>
              <Plus className="size-3.5" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="stack-table w-full text-sm">
              <thead>
                <tr>
                  <th className={thCls}>Part</th>
                  {Array.from({ length: value.count }, (_, c) => (
                    <th key={c} className={cn(thCls, "text-right")}>
                      Case {c + 1}
                    </th>
                  ))}
                  <th className={cn(thCls, "text-right")}>Packed / ship</th>
                </tr>
              </thead>
              <tbody>
                {shipping.map((row) => (
                  <tr key={row.key} className="border-t border-slate-100">
                    <td className={cn(tdCls, "font-mono text-sm")}>{row.label}</td>
                    {Array.from({ length: value.count }, (_, c) => (
                      <td key={c} data-label={`Case ${c + 1}`} className={cn(tdCls, "text-right")}>
                        <NumberInput min={0} className={numCls} value={cellOf(value, row, c)} onChange={(e) => setCell(row, c, e.target.value)} />
                      </td>
                    ))}
                    <td
                      data-label="Packed / ship"
                      className={cn(tdCls, "text-right text-xs font-medium", sumOf(row) === row.quantity ? "text-emerald-700" : "text-red-600")}
                    >
                      {sumOf(row)} / {row.quantity}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-slate-100">
                  <td className={cn(tdCls, "text-sm text-slate-500")}>Weight (kg)</td>
                  {Array.from({ length: value.count }, (_, c) => (
                    <td key={c} data-label={`Case ${c + 1}`} className={cn(tdCls, "text-right")}>
                      <NumberInput
                        min={0}
                        step="0.1"
                        className={numCls}
                        value={value.weights[c] ?? ""}
                        onChange={(e) => {
                          const weights = [...value.weights];
                          weights[c] = e.target.value;
                          onChange({ ...value, weights });
                        }}
                      />
                    </td>
                  ))}
                  <td className="max-sm:hidden" />
                </tr>
              </tbody>
            </table>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Packer or picker: the supplying branch's current employees (legacy Packer's Name dropdown from the
 * employee master, the same list the handheld uses), or a name typed in.
 */
export function StaffNameInput({ branchId, value, onChange, placeholder }: { branchId?: string | null; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const listId = useId();
  const { data: staff = [] } = useHandheldPickers(branchId ?? null);
  return (
    <>
      <input
        className={inputCls}
        maxLength={60}
        list={listId}
        placeholder={placeholder ?? "Choose or type a name"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {staff.map((p) => (
          <option key={p.id} value={p.name}>
            {p.code}
          </option>
        ))}
      </datalist>
    </>
  );
}
