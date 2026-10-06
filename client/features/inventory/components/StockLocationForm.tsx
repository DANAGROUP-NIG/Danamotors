"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useUpdateStockLocation } from "../hooks/use-part-mutations";

interface StockLocationFormProps {
  branchId: string;
  branchName: string;
  partId: string;
  initial?: {
    rackLocation: string | null;
    binCard?: string | null;
    minimumStock: number;
    maximumStock: number | null;
  };
  onDone: () => void;
}

/** Where a part is kept at one branch (legacy location and bin card) and its branch stock levels. */
export function StockLocationForm({ branchId, branchName, partId, initial, onDone }: StockLocationFormProps) {
  const update = useUpdateStockLocation();
  const [rack, setRack] = useState(initial?.rackLocation ?? "");
  const [binCard, setBinCard] = useState(initial?.binCard ?? "");
  const [minStock, setMinStock] = useState(String(initial?.minimumStock ?? 0));
  const [maxStock, setMaxStock] = useState(initial?.maximumStock != null ? String(initial.maximumStock) : "");

  const min = Number(minStock);
  const max = maxStock === "" ? null : Number(maxStock);
  const minInvalid = !Number.isInteger(min) || min < 0;
  const maxInvalid = max !== null && (!Number.isInteger(max) || max < 0);
  const rangeInvalid = !minInvalid && !maxInvalid && max !== null && max < min;

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (minInvalid || maxInvalid || rangeInvalid) return;
        update.mutate(
          {
            branchId,
            partId,
            payload: { rackLocation: rack.trim() || null, binCard: binCard.trim() || null, minimumStock: min, maximumStock: max },
          },
          { onSuccess: onDone },
        );
      }}
    >
      <p className="text-sm text-slate-600">
        Location details for <span className="font-medium">{branchName}</span>. Quantities are not changed here.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location (rack / shelf)">
          <input className={inputCls} maxLength={40} placeholder="e.g. N-QSB" value={rack} onChange={(e) => setRack(e.target.value)} />
        </Field>
        <Field label="Bin card">
          <input
            className={inputCls}
            maxLength={20}
            placeholder="e.g. AUTO"
            value={binCard}
            onChange={(e) => setBinCard(e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Minimum stock" error={minInvalid ? "Enter a whole number of 0 or more" : undefined}>
          <input type="number" min={0} className={inputCls} value={minStock} onChange={(e) => setMinStock(e.target.value)} />
        </Field>
        <Field
          label="Maximum stock (optional)"
          error={maxInvalid ? "Enter a whole number of 0 or more" : rangeInvalid ? "Must be at least the minimum" : undefined}
        >
          <input type="number" min={0} className={inputCls} value={maxStock} onChange={(e) => setMaxStock(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" disabled={update.isPending || minInvalid || maxInvalid || rangeInvalid}>
        {update.isPending ? "Saving…" : "Save location"}
      </Button>
    </form>
  );
}
