"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, FileUp, Info, Loader2, XCircle } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { useVehicleModels } from "@/features/warranty/hooks/use-warranty";
import { useAddCampaignVehicles, usePreviewVehicles } from "../hooks/use-campaigns";
import type { AddVehiclesPayload, AddVehiclesResult, Campaign } from "../types/campaign.types";

type Tab = "paste" | "criteria" | "file";

/** Same rules as the server (17 characters, no I/O/Q), for instant line highlighting. */
function lineError(raw: string): string | null {
  const vin = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!vin) return null;
  if (vin.length !== 17) return "must be 17 characters";
  const bad = vin.match(/[IOQ]/);
  if (bad) return `contains letter ${bad[0]}`;
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return "contains characters other than letters and digits";
  return null;
}

/** Reads VINs from an .xlsx/.xls/.csv file: a column headed VIN / Chassis, else the first column. */
async function vinsFromFile(file: File): Promise<string[]> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: false });
  if (rows.length === 0) return [];
  const header = rows[0].map((c) => String(c ?? "").trim().toLowerCase());
  const col = header.findIndex((h) => h === "vin" || h.includes("chassis") || h === "vin no" || h === "vin number");
  const start = col >= 0 ? 1 : 0;
  const index = col >= 0 ? col : 0;
  return rows.slice(start).map((r) => String(r[index] ?? "").trim()).filter(Boolean);
}

function Summary({ result, onToggleInvalid }: { result: AddVehiclesResult; onToggleInvalid: () => void }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs font-medium">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-700">
        <CheckCircle2 className="size-4" /> {result.toAdd.toLocaleString("en-NG")} valid
      </span>
      {result.invalid.length > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-red-700">
          <XCircle className="size-4" /> {result.invalid.length} invalid
          <button type="button" className="underline" onClick={onToggleInvalid}>
            view
          </button>
        </span>
      )}
      {(result.alreadyInCampaign > 0 || result.duplicatesInInput > 0) && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600">
          <Info className="size-4" /> {result.alreadyInCampaign + result.duplicatesInInput} already in campaign
        </span>
      )}
      {result.notInSystem > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700">
          <AlertTriangle className="size-4" /> {result.notInSystem.toLocaleString("en-NG")} not in system — will be tracked by VIN
        </span>
      )}
    </div>
  );
}

/** Screen 11 — add affected vehicles by pasted VINs, by criteria, or from a file. */
export function AddVehiclesDialog({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("paste");
  const [text, setText] = useState("");
  const [fileVins, setFileVins] = useState<string[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [modelIds, setModelIds] = useState<string[]>(campaign.models.map((m) => m.vehicleModelId));
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [vinFrom, setVinFrom] = useState("");
  const [vinTo, setVinTo] = useState("");
  const [showInvalid, setShowInvalid] = useState(false);
  const { data: models = [] } = useVehicleModels();
  const preview = usePreviewVehicles(campaign.id);
  const add = useAddCampaignVehicles(campaign.id);
  const fileInput = useRef<HTMLInputElement>(null);

  const lines = text.split(/\r?\n/);
  const lineErrors = lines.map(lineError);

  const payload: AddVehiclesPayload | null = useMemo(() => {
    if (tab === "paste") {
      const vins = text.split(/\r?\n/).filter((l) => l.trim());
      return vins.length ? { vins } : null;
    }
    if (tab === "file") return fileVins?.length ? { vins: fileVins } : null;
    if (!modelIds.length) return null;
    return {
      criteria: {
        vehicleModelIds: modelIds,
        yearFrom: yearFrom ? Number(yearFrom) : null,
        yearTo: yearTo ? Number(yearTo) : null,
        vinFrom: vinFrom.trim() || null,
        vinTo: vinTo.trim() || null,
      },
    };
  }, [tab, text, fileVins, modelIds, yearFrom, yearTo, vinFrom, vinTo]);

  // Live validation against the server (duplicates, VINs not in the system) as the input settles.
  const debouncedPayload = useDebouncedValue(payload, 600);
  const previewMutate = preview.mutate;
  useEffect(() => {
    if (debouncedPayload) previewMutate(debouncedPayload);
  }, [debouncedPayload, previewMutate]);

  const result = payload ? preview.data : undefined;
  const stale = payload !== debouncedPayload || preview.isPending;

  async function onFile(file: File) {
    setFileError(null);
    setFileName(file.name);
    try {
      const vins = await vinsFromFile(file);
      if (vins.length === 0) setFileError("No VINs found in the first sheet");
      setFileVins(vins);
    } catch {
      setFileVins(null);
      setFileError("Could not read the file. Use .xlsx, .xls or .csv with a VIN column.");
    }
  }

  return (
    <ModalFame isOpen onClose={onClose} title="Add affected vehicles">
      <div className="grid gap-4">
        <div className="flex gap-6 border-b border-slate-200" role="tablist">
          {(
            [
              ["paste", "Paste VINs"],
              ["criteria", "By criteria"],
              ["file", "Upload file"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium",
                tab === value ? "border-primary text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "paste" && (
          <div className="flex max-h-72 overflow-hidden rounded-lg border border-slate-200 focus-within:ring-2 focus-within:ring-ring">
            <div aria-hidden className="select-none overflow-hidden bg-slate-50 py-2 text-right font-mono text-sm leading-6 text-slate-400">
              {lines.map((_, i) => (
                <div key={i} className={cn("px-3", lineErrors[i] && "bg-red-100 text-red-600")}>
                  {i + 1}
                </div>
              ))}
            </div>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder={"One VIN per line\nKNAPU81BDP7123456\nKNDEU2A20P7654321"}
              className="min-h-56 flex-1 resize-none bg-white px-3 py-2 font-mono text-sm uppercase leading-6 outline-none"
            />
          </div>
        )}

        {tab === "criteria" && (
          <div className="grid gap-4">
            <Field label="Models">
              <div className="flex flex-wrap gap-2">
                {models.map((m) => {
                  const on = modelIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setModelIds((ids) => (on ? ids.filter((x) => x !== m.id) : [...ids, m.id]))}
                      className={cn("rounded-full border px-3 py-1.5 text-sm", on ? "border-primary bg-primary text-white" : "border-slate-200 bg-white hover:bg-slate-50")}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Model year from">
                <input className={inputCls} inputMode="numeric" value={yearFrom} onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, "").slice(0, 4))} />
              </Field>
              <Field label="Model year to">
                <input className={inputCls} inputMode="numeric" value={yearTo} onChange={(e) => setYearTo(e.target.value.replace(/\D/g, "").slice(0, 4))} />
              </Field>
              <Field label="VIN from (optional)">
                <input className={cn(inputCls, "font-mono uppercase")} value={vinFrom} onChange={(e) => setVinFrom(e.target.value)} />
              </Field>
              <Field label="VIN to (optional)">
                <input className={cn(inputCls, "font-mono uppercase")} value={vinTo} onChange={(e) => setVinTo(e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-slate-500">Selects registered vehicles of these models. Vehicles not in the system can only be added by VIN.</p>
          </div>
        )}

        {tab === "file" && (
          <div className="grid gap-2">
            <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 p-8 text-sm text-slate-500 hover:bg-slate-50"
            >
              <FileUp className="size-6" />
              {fileName ? `${fileName} — ${fileVins?.length ?? 0} VINs read` : "Choose the manufacturer's VIN list (.xlsx, .xls or .csv)"}
            </button>
            <p className="text-xs text-slate-500">Uses a column headed “VIN” or “Chassis”, otherwise the first column.</p>
            {fileError && <p className="text-sm text-red-600">{fileError}</p>}
          </div>
        )}

        {payload && (
          <div className={cn("space-y-3 transition-opacity", stale && "opacity-60")}>
            {preview.isError ? (
              <p className="text-sm text-red-600">Could not validate the vehicles. Check the input.</p>
            ) : result ? (
              <Summary result={result} onToggleInvalid={() => setShowInvalid((v) => !v)} />
            ) : (
              <p className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="size-4 animate-spin" /> Validating…
              </p>
            )}
            {result && result.invalid.length > 0 && (
              <details open={showInvalid} className="rounded-lg border border-slate-200">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-semibold">
                  <ChevronDown className="size-4" /> Invalid lines
                </summary>
                <ul className="max-h-40 space-y-1 overflow-y-auto border-t border-slate-100 px-4 py-3 text-sm">
                  {result.invalid.map((i) => (
                    <li key={`${i.line}-${i.value}`}>
                      <span className="font-medium text-red-600">Line {i.line}:</span> <span className="font-mono">{i.value}</span> — {i.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!payload || !result || stale || result.toAdd === 0 || add.isPending} onClick={() => payload && add.mutate(payload, { onSuccess: onClose })}>
            {add.isPending ? "Adding…" : `Add ${result && !stale ? result.toAdd.toLocaleString("en-NG") : ""} vehicles`}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
