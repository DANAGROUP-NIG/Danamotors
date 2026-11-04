"use client";

import { useState, type KeyboardEvent } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Eraser, Info, Loader2, Plus, Save, ScanLine, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import ModalFame from "@/components/modals/ModalFame";
import { cn } from "@/lib/utils";
import { AlertBanner, SectionCard } from "@/features/warranty/components/ui";
import { fmtDate } from "@/features/warranty/lib/warranty-format";
import { useAddVinRanges, usePreviewVinRanges, useRemoveVinRange } from "../hooks/use-campaigns";
import { normalizeVin, parseVinRanges, rangeKey, vinError, vinRangeError, vinRangeSize, type VinRangeDraft } from "../lib/vin-range";
import type { AddVinRangesResult, Campaign, VinRange } from "../types/campaign.types";

const textareaCls = "min-h-28 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-ring";

function serials(range: VinRangeDraft) {
  const size = vinRangeSize(range);
  if (size === null) return "Alphanumeric serials";
  return size === 1 ? "Single VIN" : `${size.toLocaleString("en-NG")} VINs`;
}

/** A VIN input with a live 17-character counter and a validity mark. */
function VinInput({ id, label, value, onChange, onEnter, placeholder, autoFocus }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const vin = normalizeVin(value);
  const error = vin ? vinError(vin) : null;
  return (
    <label htmlFor={id} className="grid min-w-0 flex-1 gap-1.5">
      <span className="flex items-center justify-between text-sm font-semibold text-slate-700">
        {label}
        <span className={cn("font-mono text-xs tabular-nums", !vin ? "text-slate-400" : error ? "text-amber-600" : "text-emerald-600")}>{vin.length}/17</span>
      </span>
      <span className="relative">
        <input
          id={id}
          autoFocus={autoFocus}
          className={cn(inputCls, "pr-9 font-mono uppercase tracking-wide", vin && error && "border-amber-400")}
          value={value}
          maxLength={24}
          spellCheck={false}
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={Boolean(vin && error)}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onEnter();
            }
          }}
        />
        {vin && !error && <CheckCircle2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-emerald-500" aria-hidden />}
      </span>
    </label>
  );
}

function Summary({ result }: { result: AddVinRangesResult }) {
  const items = [
    ["New ranges", result.newRanges],
    ["Already saved", result.alreadySaved],
    ["Vehicles in the system inside them", result.vehiclesInRanges],
    ["Already in the campaign", result.alreadyInCampaign],
    ["Will be added now", result.toAdd],
  ] as const;
  return (
    <dl className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-5">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className={cn("text-lg font-semibold tabular-nums", label === "Will be added now" ? "text-emerald-700" : "text-slate-800")}>{value.toLocaleString("en-NG")}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * "Vehicles to be checked" of an FPC bulletin (or any campaign): VIN ranges. Saving adds every
 * vehicle in the system inside a range; a vehicle registered later inside an active campaign's
 * range is added on registration.
 */
export function VinRangesCard({ campaign, canEdit }: { campaign: Campaign; canEdit: boolean }) {
  const saved = campaign.vinRanges ?? [];
  const editable = canEdit && campaign.status !== "CLOSED";
  const preview = usePreviewVinRanges(campaign.id);
  const add = useAddVinRanges(campaign.id);
  const remove = useRemoveVinRange(campaign.id);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entryError, setEntryError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<VinRangeDraft[]>([]);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [summary, setSummary] = useState<AddVinRangesResult | null>(null);
  const [removing, setRemoving] = useState<VinRange | null>(null);

  const savedKeys = new Set(saved.map((r) => rangeKey(r)));
  const draftErrors = drafts.map((d) => vinRangeError(d) ?? (savedKeys.has(rangeKey(d)) ? "Already saved" : null));
  const validDrafts = drafts.filter((_, i) => !draftErrors[i]);
  const hasErrors = draftErrors.some(Boolean);

  function changeDrafts(next: VinRangeDraft[]) {
    setDrafts(next);
    setSummary(null);
  }

  function addEntry() {
    const range = { vinFrom: normalizeVin(from), vinTo: normalizeVin(to) || normalizeVin(from) };
    const problem = vinRangeError(range);
    if (problem) return setEntryError(problem);
    if (drafts.some((d) => rangeKey(d) === rangeKey(range)) || savedKeys.has(rangeKey(range))) return setEntryError("This range is already listed");
    changeDrafts([...drafts, range]);
    setFrom("");
    setTo("");
    setEntryError(null);
    document.getElementById(`vin-from-${campaign.id}`)?.focus();
  }

  function addPasted() {
    const parsed = parseVinRanges(pasted);
    const known = new Set(drafts.map(rangeKey));
    changeDrafts([...drafts, ...parsed.filter((r) => !known.has(rangeKey(r)))]);
    setPasted("");
    setPasting(false);
  }

  function check() {
    preview.mutate(validDrafts, { onSuccess: setSummary });
  }

  function save() {
    add.mutate(validDrafts, {
      onSuccess: () => {
        changeDrafts([]);
      },
    });
  }

  return (
    <SectionCard
      icon={<ScanLine />}
      title="Vehicles to check"
      note={saved.length ? `${saved.length} VIN range${saved.length === 1 ? "" : "s"}` : "VIN ranges"}
      action={
        editable && (
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setPasting((v) => !v)}>
            <ClipboardList className="size-4" /> {pasting ? "Close paste" : "Paste ranges"}
          </Button>
        )
      }
    >
      <p className="mb-4 flex items-start gap-2 text-sm text-slate-500">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        Enter the manufacturer&apos;s VIN ranges. A single VIN is from = to. Saving adds every vehicle already in the system; a vehicle registered later with a VIN inside a range is added automatically while the campaign is active.
      </p>

      {editable && (
        <div className="space-y-3 rounded-lg border border-dashed border-slate-300 p-4">
          {pasting ? (
            <div className="space-y-2">
              <label htmlFor={`vin-paste-${campaign.id}`} className="text-sm font-semibold text-slate-700">
                One range per line: <span className="font-mono font-normal">FROM TO</span>, or a single VIN
              </label>
              <textarea
                id={`vin-paste-${campaign.id}`}
                className={textareaCls}
                value={pasted}
                spellCheck={false}
                placeholder={"KNAKU813DC5214595 KNAKU813DC5214616\nKNAKU813DC5215053"}
                onChange={(event) => setPasted(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setPasting(false)}>Cancel</Button>
                <Button type="button" size="sm" disabled={!pasted.trim()} onClick={addPasted}>Add to list</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <VinInput id={`vin-from-${campaign.id}`} label="From VIN" value={from} onChange={(v) => { setFrom(v); setEntryError(null); }} onEnter={addEntry} placeholder="KNAKU813DC5214595" />
              <VinInput id={`vin-to-${campaign.id}`} label="To VIN" value={to} onChange={(v) => { setTo(v); setEntryError(null); }} onEnter={addEntry} placeholder="Blank = single VIN" />
              <Button type="button" className="gap-1.5 md:mb-px" onClick={addEntry} disabled={!from.trim()}>
                <Plus className="size-4" /> Add
              </Button>
            </div>
          )}
          {entryError && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-amber-700">
              <AlertTriangle className="size-4" /> {entryError}
            </p>
          )}

          {drafts.length > 0 && (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <caption className="sr-only">Ranges to save</caption>
                  <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500">
                    <tr>
                      <th className="w-12 px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">From VIN</th>
                      <th className="px-3 py-2 text-left font-medium">To VIN</th>
                      <th className="px-3 py-2 text-left font-medium">Covers</th>
                      <th className="w-10 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drafts.map((d, i) => (
                      <tr key={rangeKey(d)} className={cn(draftErrors[i] && "bg-amber-50")}>
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono">{d.vinFrom}</td>
                        <td className="px-3 py-2 font-mono">{d.vinTo}</td>
                        <td className="px-3 py-2">{draftErrors[i] ? <span className="text-amber-700">{draftErrors[i]}</span> : <span className="text-slate-600">{serials(d)}</span>}</td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" aria-label={`Remove range ${i + 1}`} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => changeDrafts(drafts.filter((_, j) => j !== i))}>
                            <X className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {summary && <Summary result={summary} />}
              {summary && (
                <p className="text-xs text-slate-500">VINs not registered yet are not added now; they join the campaign when the vehicle is registered while it is active.</p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                {hasErrors && <p className="mr-auto text-sm text-amber-700">Fix or remove the highlighted ranges; only valid ranges are saved.</p>}
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => changeDrafts([])}>
                  <Eraser className="size-4" /> Clear
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={validDrafts.length === 0 || preview.isPending} onClick={check}>
                  {preview.isPending && <Loader2 className="size-4 animate-spin" />} Check
                </Button>
                <Button type="button" size="sm" className="gap-1.5" disabled={validDrafts.length === 0 || add.isPending} onClick={save}>
                  {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save {validDrafts.length} range{validDrafts.length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={cn(editable && "mt-4")}>
        {saved.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">No VIN ranges saved.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <caption className="sr-only">Saved VIN ranges</caption>
              <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500">
                <tr>
                  <th className="w-12 px-3 py-2 text-left font-medium">S.No</th>
                  <th className="px-3 py-2 text-left font-medium">From VIN</th>
                  <th className="px-3 py-2 text-left font-medium">To VIN</th>
                  <th className="px-3 py-2 text-left font-medium">Covers</th>
                  <th className="px-3 py-2 text-left font-medium">Added</th>
                  {editable && <th className="w-10 px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {saved.map((r, i) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 font-mono">{r.vinFrom}</td>
                    <td className="px-3 py-2 font-mono">{r.vinTo}</td>
                    <td className="px-3 py-2 text-slate-600">{serials(r)}</td>
                    <td className="px-3 py-2 text-slate-500">{fmtDate(r.createdAt)}</td>
                    {editable && (
                      <td className="px-3 py-2 text-right">
                        <button type="button" aria-label={`Remove range ${r.vinFrom} to ${r.vinTo}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setRemoving(r)}>
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalFame isOpen={removing !== null} onClose={() => setRemoving(null)} title="Remove VIN range">
        <div className="grid gap-4">
          <p className="font-mono text-sm text-slate-700">
            {removing?.vinFrom} → {removing?.vinTo}
          </p>
          <AlertBanner tone="amber" icon={<AlertTriangle />} title="Vehicles already added stay in the campaign">
            Mark them not applicable from the vehicle list if they should not be checked. Vehicles registered later inside this range will no longer be added.
          </AlertBanner>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoving(null)}>Keep range</Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={remove.isPending}
              onClick={() => removing && remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
            >
              {remove.isPending ? "Removing…" : "Remove range"}
            </Button>
          </div>
        </div>
      </ModalFame>
    </SectionCard>
  );
}
