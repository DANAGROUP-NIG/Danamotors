"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { copyModelRates, errorMessage, labourRateKeys, type RateModelOption, type SpreadResult } from "../api";
import { ModelChecklist } from "./model-checklist";
import { SpreadPreview } from "./spread-preview";
import { ROUNDING } from "./bulk-change-modal";

/** Copies every rate of one model to others, e.g. for a new model, optionally a percentage dearer or cheaper. */
export function CopyModelModal({ isOpen, onClose, models }: { isOpen: boolean; onClose: () => void; models: RateModelOption[] }) {
  const queryClient = useQueryClient();
  const [fromModelId, setFromModelId] = useState("");
  const [toModelIds, setToModelIds] = useState<string[]>([]);
  const [percent, setPercent] = useState("");
  const [roundTo, setRoundTo] = useState(10);
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState<SpreadResult | null>(null);

  const pct = percent.trim() === "" ? undefined : Number(percent);
  const valid = !!fromModelId && toModelIds.length > 0 && (pct === undefined || (Number.isFinite(pct) && pct >= -90 && pct <= 500));
  const changes = preview ? preview.create + preview.update : 0;

  const run = useMutation({
    mutationFn: (dryRun: boolean) =>
      copyModelRates({
        fromModelId,
        toModelIds,
        overwrite,
        percent: pct || undefined,
        roundTo: pct ? roundTo : 0.01,
        ...(dryRun ? { dryRun: true } : { expected: changes }),
      }),
    onSuccess: (result) => {
      if (!result.applied) return setPreview(result);
      toast.success(`Copied from ${result.from}: ${result.create} added, ${result.update} replaced`);
      queryClient.invalidateQueries({ queryKey: labourRateKeys.all });
      close();
    },
    onError: (error) => {
      setPreview(null);
      toast.error(errorMessage(error, "Nothing was saved"));
    },
  });

  function close() {
    setPreview(null);
    setFromModelId("");
    setToModelIds([]);
    setPercent("");
    setOverwrite(false);
    onClose();
  }
  const changed = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPreview(null);
  };

  return (
    <ModalFame isOpen={isOpen} onClose={close} size="wide" title="Copy model rates" description="Copies every labour rate of one model to the chosen models." preventAccidentalClose={run.isPending}>
      <div className="grid gap-4">
        <Field label="Copy from">
          <select className={inputCls} value={fromModelId} onChange={(e) => { changed(setFromModelId)(e.target.value); setToModelIds((ids) => ids.filter((id) => id !== e.target.value)); }}>
            <option value="">Choose a model</option>
            {models.filter((m) => m.rates > 0).map((m) => (
              <option key={m.id} value={m.id}>{m.description} ({m.rates.toLocaleString()} rates)</option>
            ))}
          </select>
        </Field>
        <Field label="Copy to">
          <ModelChecklist models={models} selected={toModelIds} onChange={changed(setToModelIds)} exclude={fromModelId} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Change the copied rates by % (optional)">
            <input type="number" step="0.01" className={inputCls} placeholder="e.g. 5" value={percent} onChange={(e) => changed(setPercent)(e.target.value)} />
          </Field>
          <Field label="Round the result to">
            <select className={inputCls} value={roundTo} disabled={!pct} onChange={(e) => changed(setRoundTo)(Number(e.target.value))}>
              {ROUNDING.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={overwrite} onChange={(e) => changed(setOverwrite)(e.target.checked)} />
          Replace rates the chosen models already have
        </label>

        {preview && <SpreadPreview result={preview} overwrite={overwrite} />}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!valid || run.isPending} onClick={() => run.mutate(true)}>Preview</Button>
          <Button disabled={!preview || changes === 0 || run.isPending} onClick={() => run.mutate(false)}>
            {run.isPending && preview ? "Copying…" : preview ? `Copy ${changes.toLocaleString()} rates` : "Copy"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
