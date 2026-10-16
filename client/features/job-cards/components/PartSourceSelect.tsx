"use client";

import { inputCls } from "@/components/forms/FormField";
import { usePartSources } from "@/features/inventory/hooks/use-parts";
import type { PartSourceRecord } from "@/features/inventory/types/inventory.types";

const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

/** A record can be quoted when it is active and has a retail rate. */
const quotable = (record: PartSourceRecord) => record.partStatus === "ACTIVE" && record.retailRate != null;

/**
 * Switches an estimate part line between the main part and its source records (local, used,
 * repaired…). Each is its own part record with its own price and stock, so changing the source
 * swaps the line's part. Staff-only.
 */
export function PartSourceSelect({ partId, branchId, onChange }: { partId: string; branchId: string; onChange: (record: PartSourceRecord) => void }) {
  const query = usePartSources(partId, branchId);
  if (query.isError) return <span className="text-xs text-destructive">Sources unavailable</span>;
  if (!query.data) return <span className="text-xs text-muted-foreground">Loading sources...</span>;
  const records = query.data.records;
  const current = records.find((record) => record.id === partId);
  if (records.length < 2) return <span className="text-xs text-muted-foreground">{current?.sourceLabel}</span>;
  return (
    <select
      className={`${inputCls} h-8 w-auto text-xs`}
      aria-label="Part source"
      value={partId}
      onChange={(event) => {
        const next = records.find((record) => record.id === event.target.value);
        if (next) onChange(next);
      }}
    >
      {records.map((record) => (
        <option key={record.id} value={record.id} disabled={record.id !== partId && !quotable(record)}>
          {record.sourceLabel} · {record.partNumber} · {record.retailRate != null ? money.format(record.retailRate) : "no price"}
          {record.stock ? ` · ${record.stock.available} in stock` : ""}
          {record.partStatus !== "ACTIVE" ? " · blocked" : ""}
        </option>
      ))}
    </select>
  );
}
