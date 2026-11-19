"use client";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/features/job-cards/components/opening/opening-ui";
import { WorkshopPicker, type PickerRecord } from "@/features/job-cards/components/WorkshopPicker";
import { usePdiDefects } from "../hooks/use-pdi";
import { defectGridTotals, defectLineTotal, defectLineValid, formatMoney } from "../lib/pdi.logic";
import type { DefectDraft } from "../types/pdi.types";
import { pdiInput } from "./pdi-ui";

let counter = 0;
export const emptyDefect = (): DefectDraft => ({ key: `defect-${++counter}`, defectId: "", description: "", group: null, spare: 0, oil: 0, labour: 0 });

/**
 * Customer requests / defects detected (legacy grid): defect from the PDI defect master or free text,
 * with estimated spare, oil and labour amounts. Line and column totals update as you type.
 */
export function DefectsGrid({ value, onChange, vehicleId, disabled, showErrors }: {
  value: DefectDraft[];
  onChange: (rows: DefectDraft[]) => void;
  vehicleId?: string;
  disabled?: boolean;
  showErrors?: boolean;
}) {
  const defects = usePdiDefects(vehicleId);
  const options: PickerRecord[] = (defects.data ?? []).map(row => ({ id: row.id, code: row.code, description: row.group ? `${row.description} · ${row.group}` : row.description }));
  const totals = defectGridTotals(value);
  const edit = (key: string, patch: Partial<DefectDraft>) => onChange(value.map(row => row.key === key ? { ...row, ...patch } : row));

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_repeat(4,minmax(0,1fr))_2.5rem] gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground lg:grid">
        <span>Defect</span><span>Description</span><span className="text-right">Spare</span><span className="text-right">Oil</span><span className="text-right">Labour</span><span className="text-right">Total</span><span />
      </div>
      {value.map((row, index) => {
        const invalid = showErrors && !defectLineValid(row);
        return (
          <div key={row.key} className="grid gap-2 rounded-lg border border-border p-3 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_repeat(4,minmax(0,1fr))_2.5rem] lg:items-start lg:border-0 lg:p-1">
            <WorkshopPicker
              label={`Defect ${index + 1}`}
              hideLabel
              endpoint="/pdi/defects"
              collection="items"
              localOptions={options}
              optionsLoading={defects.isLoading}
              optionsError={defects.isError}
              onRetry={() => void defects.refetch()}
              value={row.defectId}
              disabled={disabled}
              onChange={id => {
                const picked = defects.data?.find(option => option.id === id);
                edit(row.key, {
                  defectId: id,
                  group: picked?.group ?? null,
                  description: row.description || (picked?.description ?? ""),
                  ...(picked?.estimate && !row.spare && !row.oil && !row.labour
                    ? { spare: Number(picked.estimate.partAmount), oil: Number(picked.estimate.oilAmount), labour: Number(picked.estimate.labourAmount) }
                    : {}),
                });
              }}
            />
            <div>
              <input
                aria-label={`Description ${index + 1}`}
                aria-invalid={invalid}
                className={`${pdiInput} ${invalid ? "border-destructive" : ""}`}
                placeholder="Describe the defect"
                maxLength={2000}
                disabled={disabled}
                value={row.description}
                onChange={event => edit(row.key, { description: event.target.value })}
              />
              {invalid && <p className="mt-1 text-xs text-destructive">Choose a defect or describe it</p>}
            </div>
            <CurrencyInput label={`Spare ${index + 1}`} value={row.spare} onChange={spare => edit(row.key, { spare })} />
            <CurrencyInput label={`Oil ${index + 1}`} value={row.oil} onChange={oil => edit(row.key, { oil })} />
            <CurrencyInput label={`Labour ${index + 1}`} value={row.labour} onChange={labour => edit(row.key, { labour })} />
            <p className="flex h-10 items-center justify-end rounded-lg bg-muted px-3 text-sm font-semibold tabular-nums" aria-label={`Line ${index + 1} total`}>{formatMoney(defectLineTotal(row))}</p>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove defect ${index + 1}`} disabled={disabled || value.length === 1} onClick={() => onChange(value.filter(item => item.key !== row.key))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={disabled || value.length >= 100} onClick={() => onChange([...value, emptyDefect()])}>
          <Plus className="size-4" /> Add defect
        </Button>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          {([["Spare", totals.spare], ["Oil", totals.oil], ["Labour", totals.labour], ["Total", totals.total]] as const).map(([label, amount]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 sm:block sm:text-right">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
              <dd className={`tabular-nums ${label === "Total" ? "text-base font-bold" : "font-medium"}`}>{formatMoney(amount)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
