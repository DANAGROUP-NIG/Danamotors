"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { applyLabourToModels, errorMessage, labourRateKeys, type Pricing, type RateModelOption, type SpreadResult } from "../api";
import { ModelChecklist } from "./model-checklist";
import { SpreadPreview } from "./spread-preview";

/**
 * Adds one labour to many models at once, as ABJ added labours to 42 models in one go. Models that already
 * have the labour keep their rate unless "replace" is ticked.
 */
export function ApplyToModelsModal({ isOpen, onClose, models }: { isOpen: boolean; onClose: () => void; models: RateModelOption[] }) {
  const queryClient = useQueryClient();
  const [labourItemId, setLabourItemId] = useState("");
  const [modelIds, setModelIds] = useState<string[]>([]);
  const [pricing, setPricing] = useState<Pricing>("TIME");
  const [hours, setHours] = useState("1");
  const [rate, setRate] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState<SpreadResult | null>(null);

  // Start with every active model chosen, as legacy did for a new labour.
  useEffect(() => {
    if (isOpen) setModelIds(models.filter((m) => m.active).map((m) => m.id));
  }, [isOpen, models]);

  const valid = !!labourItemId && modelIds.length > 0 && Number(hours) > 0 && rate.trim() !== "" && Number(rate) >= 0;
  const input = () => ({ labourItemId, modelIds, pricing, hours: Number(hours), rate: Number(rate), active: true, overwrite });

  const run = useMutation({
    mutationFn: (dryRun: boolean) =>
      applyLabourToModels({ ...input(), ...(dryRun ? { dryRun: true } : { expected: (preview?.create ?? 0) + (preview?.update ?? 0) }) }),
    onSuccess: (result) => {
      if (!result.applied) return setPreview(result);
      toast.success(`${result.labour}: ${result.create} added, ${result.update} replaced`);
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
    setLabourItemId("");
    setRate("");
    setOverwrite(false);
    onClose();
  }
  const changed = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPreview(null);
  };
  const changes = preview ? preview.create + preview.update : 0;

  return (
    <ModalFame isOpen={isOpen} onClose={close} size="wide" title="Add a labour to models" description="Creates the rate on every chosen model in one step." preventAccidentalClose={run.isPending}>
      <div className="grid gap-4">
        <WorkshopPicker
          required
          label="Labour operation"
          endpoint="/service/labour-items"
          collection="labourItems"
          value={labourItemId}
          onChange={changed(setLabourItemId)}
          onSelect={(row) => {
            const item = row as { defaultHours?: number; rate?: number };
            if (item.defaultHours) setHours(String(item.defaultHours));
            if (item.rate !== undefined) setRate(String(item.rate));
          }}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Pricing">
            <select className={inputCls} value={pricing} onChange={(e) => changed(setPricing)(e.target.value as Pricing)}>
              <option value="TIME">Time: hours × rate</option>
              <option value="FIXED">Fixed amount</option>
            </select>
          </Field>
          <Field label="Hours">
            <input type="number" min="0.01" step="0.01" className={inputCls} value={hours} onChange={(e) => changed(setHours)(e.target.value)} />
          </Field>
          <Field label={pricing === "FIXED" ? "Fixed amount (₦)" : "Hourly rate (₦)"}>
            <input type="number" min="0" step="0.01" className={inputCls} value={rate} onChange={(e) => changed(setRate)(e.target.value)} />
          </Field>
        </div>
        <Field label="Models">
          <ModelChecklist models={models} selected={modelIds} onChange={changed(setModelIds)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={overwrite} onChange={(e) => changed(setOverwrite)(e.target.checked)} />
          Replace the rate on models that already have this labour
        </label>

        {preview && <SpreadPreview result={preview} overwrite={overwrite} />}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!valid || run.isPending} onClick={() => run.mutate(true)}>Preview</Button>
          <Button disabled={!preview || changes === 0 || run.isPending} onClick={() => run.mutate(false)}>
            {run.isPending && preview ? "Saving…" : preview ? `Save ${changes.toLocaleString()} rates` : "Save"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
