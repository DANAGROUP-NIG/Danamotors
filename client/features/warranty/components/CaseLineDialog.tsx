"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { useAddCaseLine, useUpdateCaseLine, useWarrantyCodes, useWarrantyParts } from "../hooks/use-warranty";
import { fmtNaira } from "../lib/warranty-format";
import type { CaseLine, LineRole, WarrantyPart } from "../types/warranty.types";

type Mode = { kind: "PART"; role: LineRole } | { kind: "LABOUR" };

/** Add or edit a claim line. Only warranty-applicable parts can be claimed. */
export function CaseLineDialog({ caseId, mode, line, onClose }: { caseId: string; mode: Mode; line?: CaseLine; onClose: () => void }) {
  const add = useAddCaseLine(caseId);
  const update = useUpdateCaseLine(caseId);
  const { data: codes } = useWarrantyCodes();
  const isPart = mode.kind === "PART";

  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 300);
  const parts = useWarrantyParts(debounced, false);
  const [part, setPart] = useState<WarrantyPart | null>(null);

  const [operationCode, setOperationCode] = useState(line?.operationCode ?? "");
  const [description, setDescription] = useState(line?.description ?? "");
  const [defectCodeId, setDefectCodeId] = useState(line?.defectCodeId ?? "");
  const [positionCodeId, setPositionCodeId] = useState(line?.positionCodeId ?? "");
  const [batchNo, setBatchNo] = useState(line?.batchNo ?? "");
  const [quantity, setQuantity] = useState(line ? String(line.quantity) : "1");
  const [rate, setRate] = useState(line ? String(line.rate) : "");

  const qty = Number(quantity);
  const defaultRate = part ? (part.warrantyRate ?? part.retailRate ?? part.unitPrice) : null;
  const effectiveRate = rate !== "" ? Number(rate) : (defaultRate ?? line?.rate ?? NaN);
  const valid =
    qty > 0 &&
    Number.isFinite(effectiveRate) &&
    effectiveRate >= 0 &&
    (isPart ? Boolean(line || part) : description.trim().length > 0 && rate !== "");
  const pending = add.isPending || update.isPending;

  function save() {
    const common = {
      defectCodeId: defectCodeId || null,
      positionCodeId: positionCodeId || null,
      quantity: qty,
      ...(rate !== "" && { rate: Number(rate) }),
    };
    if (line) {
      update.mutate(
        {
          lineId: line.id,
          body: isPart
            ? { ...common, batchNo: batchNo.trim() || null }
            : { ...common, operationCode: operationCode.trim() || null, description: description.trim() },
        },
        { onSuccess: onClose },
      );
      return;
    }
    add.mutate(
      isPart
        ? { kind: "PART", role: mode.role, sparePartId: part!.id, batchNo: batchNo.trim() || null, ...common }
        : { kind: "LABOUR", operationCode: operationCode.trim() || null, description: description.trim(), ...common, rate: Number(rate) },
      { onSuccess: onClose },
    );
  }

  const title = line
    ? `Edit ${isPart ? "part" : "labour"} line`
    : isPart
      ? mode.role === "CAUSAL"
        ? "Add causal part"
        : "Add consequential part"
      : "Add labour";

  return (
    <ModalFame isOpen onClose={onClose} title={title}>
      <div className="grid gap-4">
        {isPart && !line && (
          <div className="grid gap-2">
            <Field label="Part">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input className={cn(inputCls, "pl-9")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search part number or name" autoFocus />
                {parts.isFetching && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-slate-400" />}
              </div>
            </Field>
            {debounced.length >= 2 && !part && (
              <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {(parts.data ?? []).length === 0 && !parts.isFetching && <li className="p-3 text-sm text-slate-400">No parts found.</li>}
                {(parts.data ?? []).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={!p.warrantyApplicable}
                      onClick={() => setPart(p)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={p.warrantyApplicable ? undefined : "Not warranty-applicable"}
                    >
                      <span className="font-mono text-xs">{p.partNumber}</span>
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-slate-500">{p.warrantyApplicable ? fmtNaira(p.warrantyRate ?? p.retailRate ?? p.unitPrice) : "Not applicable"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {part && (
              <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                <span>
                  <span className="font-mono text-xs">{part.partNumber}</span> · {part.name}
                </span>
                <button type="button" className="text-xs font-semibold text-emerald-800 hover:underline" onClick={() => setPart(null)}>
                  Change
                </button>
              </div>
            )}
          </div>
        )}
        {isPart && line && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="font-mono text-xs">{line.partNumber}</span> · {line.description}
          </p>
        )}

        {!isPart && (
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <Field label="Operation code">
              <input className={cn(inputCls, "font-mono")} value={operationCode} onChange={(e) => setOperationCode(e.target.value)} placeholder="21110R0" />
            </Field>
            <Field label="Description">
              <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Engine diagnosis" />
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={isPart ? "Defect code" : "Defect code (optional)"}>
            <select className={inputCls} value={defectCodeId} onChange={(e) => setDefectCodeId(e.target.value)}>
              <option value="">—</option>
              {codes?.defect.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.description}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Position (optional)">
            <select className={inputCls} value={positionCodeId} onChange={(e) => setPositionCodeId(e.target.value)}>
              <option value="">—</option>
              {codes?.position.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.description}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className={cn("grid gap-4", isPart ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {isPart && (
            <Field label="Batch no.">
              <input className={inputCls} value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="B2208" />
            </Field>
          )}
          <Field label={isPart ? "Quantity" : "Hours"}>
            <input className={inputCls} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Rate (₦)">
            <input
              className={inputCls}
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder={defaultRate != null ? `${defaultRate} (warranty rate)` : line ? String(line.rate) : "15000"}
            />
          </Field>
        </div>
        {isPart && !line && part && <p className="-mt-2 text-xs text-slate-500">Leave the rate blank to use the part&apos;s warranty rate.</p>}

        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-sm text-slate-600">
            Claimed: <span className="font-semibold">{valid ? fmtNaira(Math.round(qty * effectiveRate * 100) / 100) : "—"}</span>
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!valid || pending || (isPart && !defectCodeId)}>
              {pending ? "Saving…" : line ? "Save" : "Add line"}
            </Button>
          </div>
        </div>
        {isPart && !defectCodeId && <p className="-mt-2 text-right text-xs text-amber-700">Part lines need a defect code.</p>}
      </div>
    </ModalFame>
  );
}
