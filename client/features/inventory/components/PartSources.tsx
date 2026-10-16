"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { usePartSources, usePriceCategories } from "../hooks/use-parts";
import { useCreateSourceRecord } from "../hooks/use-part-mutations";
import { PART_SOURCE_CODES, partSourceLabel } from "../lib/part-codes";
import { PartStatusBadge, fmtNaira } from "./PartStatusBadge";
import type { PartMaster } from "../types/inventory.types";

// Local, used and repaired records are priced like legacy local purchases (category L, 1.5x).
const BRANCH_BOUGHT = ["L", "U", "R"];
const LOCAL_CATEGORY = "L";

function AddSourceForm({ main, usedSources, onDone }: { main: PartMaster; usedSources: string[]; onDone: () => void }) {
  const create = useCreateSourceRecord(main.id);
  const { data: categories } = usePriceCategories();
  const available = PART_SOURCE_CODES.filter((code) => code !== main.partFlag && !usedSources.includes(code));
  const initial = available.find((code) => code === "U") ?? available[0] ?? "";
  const defaultCategory = (code: string) => (BRANCH_BOUGHT.includes(code) ? LOCAL_CATEGORY : main.priceCategoryCode ?? "");
  const [source, setSource] = useState(initial);
  const [partNumber, setPartNumber] = useState(initial ? `${main.partNumber}-${initial}` : "");
  const [dealerRate, setDealerRate] = useState("");
  const [category, setCategory] = useState(defaultCategory(initial));

  const multiplier = categories?.find((c) => c.code === category)?.markupMultiplier;
  const dealer = Number(dealerRate);
  const retail = multiplier != null && dealer > 0 ? Math.round(dealer * multiplier * 100) / 100 : null;
  const valid = !!source && partNumber.trim() !== "" && Number.isFinite(dealer) && dealer > 0;

  if (!available.length) return <p className="text-sm text-muted-foreground">This part already has a record for every source.</p>;

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        create.mutate(
          { source, partNumber: partNumber.trim(), dealerRate: dealer, priceCategoryCode: category || null },
          { onSuccess: onDone },
        );
      }}
    >
      <p className="text-sm text-slate-600">
        A local, used or repaired part is its own record with its own stock, rates and bin. It copies the name, unit of
        measure, tax and classification of {main.partNumber}. The retail rate is the dealer rate × the price category
        multiplier; a vendor receipt updates both.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Source">
          <select
            className={inputCls}
            value={source}
            onChange={(event) => {
              const next = event.target.value;
              // Keep a typed part number; replace only the suggestion.
              if (partNumber === `${main.partNumber}-${source}`) setPartNumber(`${main.partNumber}-${next}`);
              if (category === defaultCategory(source)) setCategory(defaultCategory(next));
              setSource(next);
            }}
          >
            {available.map((code) => (
              <option key={code} value={code}>
                {partSourceLabel(code)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Part number">
          <input className={`${inputCls} font-mono`} value={partNumber} onChange={(event) => setPartNumber(event.target.value)} />
        </Field>
        <Field label="Dealer rate (cost)">
          <input type="number" min="0.01" step="0.01" className={inputCls} value={dealerRate} onChange={(event) => setDealerRate(event.target.value)} />
        </Field>
        <Field label="Price category">
          <select className={inputCls} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">No category (retail not set)</option>
            {categories
              ?.filter((c) => c.isActive)
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.description} (×{c.markupMultiplier})
                </option>
              ))}
          </select>
        </Field>
      </div>
      <p className="text-sm text-slate-600">Retail rate: {retail != null ? fmtNaira(retail) : "—"}</p>
      <Button type="submit" disabled={!valid || create.isPending}>
        {create.isPending ? "Adding…" : "Add source record"}
      </Button>
    </form>
  );
}

/**
 * The part and its source records: the same part from Mobis, a local purchase, second-hand or
 * repaired, each its own record with its own stock and price. Internal only.
 */
export function PartSources({ part, branchId, branchName, canCreate }: { part: PartMaster; branchId?: string | null; branchName?: string; canCreate: boolean }) {
  const { data, isLoading, isError } = usePartSources(part.id, branchId);
  const [adding, setAdding] = useState(false);
  if (isLoading) return <Loader2 className="size-5 animate-spin text-slate-400" />;
  if (isError || !data) return <p className="text-sm text-destructive">Could not load the part&apos;s sources.</p>;

  const main = data.records.find((r) => r.isMain);
  const isSourceRecord = !!part.sourceOfPartId;
  const canAdd = canCreate && !isSourceRecord && part.role === "MAIN";

  return (
    <div className="grid gap-3">
      {isSourceRecord && main ? (
        <p className="text-sm text-slate-600">
          This is the {partSourceLabel(part.partFlag).toLowerCase()} record of{" "}
          <Link href={`/inventory/${main.id}`} className="font-mono font-medium text-primary hover:underline">
            {main.partNumber}
          </Link>
          . It has its own stock and price; estimates and issues choose it explicitly.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          The same part from another source (local purchase, second-hand, repaired) is its own record with its own stock
          and price. Estimates offer every record listed here. Sources are internal and are not shown to customers.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-sm font-medium uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Part number</th>
              <th className="px-3 py-2">{branchName ? `Stock at ${branchName}` : "Stock"}</th>
              <th className="px-3 py-2">Dealer rate</th>
              <th className="px-3 py-2">Retail rate</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.records.map((record) => (
              <tr key={record.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  {record.sourceLabel}
                  {record.isMain && <span className="ml-1 text-xs text-muted-foreground">(main part)</span>}
                </td>
                <td className="px-3 py-2">
                  {record.id === part.id ? (
                    <span className="font-mono font-medium text-slate-800">{record.partNumber} (this part)</span>
                  ) : (
                    <Link href={`/inventory/${record.id}`} className="font-mono font-medium text-primary hover:underline">
                      {record.partNumber}
                    </Link>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{record.stock ? record.stock.quantity : "—"}</td>
                <td className="px-3 py-2 text-slate-600">{fmtNaira(record.dealerRate)}</td>
                <td className="px-3 py-2 text-slate-600">{record.retailRate != null ? fmtNaira(record.retailRate) : "Not set"}</td>
                <td className="px-3 py-2">
                  <PartStatusBadge status={record.partStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canAdd && (
        <div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add source record
          </Button>
        </div>
      )}
      <ModalFame isOpen={adding} onClose={() => setAdding(false)} title={`Add a source record for ${part.partNumber}`}>
        {adding && (
          <AddSourceForm
            main={part}
            usedSources={data.records.filter((r) => !r.isMain).map((r) => r.partFlag)}
            onDone={() => setAdding(false)}
          />
        )}
      </ModalFame>
    </div>
  );
}
