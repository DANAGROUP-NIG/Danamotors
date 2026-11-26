"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { bulkUpdateRates, errorMessage, labourRateKeys, type BulkAction, type BulkResult, type RateScope } from "../api";
import { NumberInput } from "@/components/forms/NumberInput";

type ActionType = BulkAction["type"];
const ACTIONS: { type: ActionType; label: string }[] = [
  { type: "CHANGE_PERCENT", label: "Change rate / amount by %" },
  { type: "SET_RATE", label: "Set rate / amount" },
  { type: "SET_HOURS", label: "Set hours" },
  { type: "SET_PRICING", label: "Set pricing (time or fixed)" },
  { type: "SET_ACTIVE", label: "Activate or deactivate" },
];
export const ROUNDING = [
  { value: 0.01, label: "Kobo (no rounding)" },
  { value: 1, label: "Nearest ₦1" },
  { value: 5, label: "Nearest ₦5" },
  { value: 10, label: "Nearest ₦10" },
  { value: 50, label: "Nearest ₦50" },
  { value: 100, label: "Nearest ₦100" },
];

const show = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString("en-NG", { maximumFractionDigits: 2 }) : typeof v === "boolean" ? (v ? "Active" : "Inactive") : String(v);

/** One change applied to many rates: preview the count and a sample, then apply it in one transaction. */
export function BulkChangeModal({
  isOpen,
  onClose,
  scope,
  scopeLabel,
  onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  scope: RateScope;
  scopeLabel: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<ActionType>("CHANGE_PERCENT");
  const [value, setValue] = useState("");
  const [roundTo, setRoundTo] = useState(10);
  const [pricing, setPricing] = useState<"TIME" | "FIXED">("TIME");
  const [active, setActive] = useState(false);
  const [preview, setPreview] = useState<BulkResult | null>(null);

  const number = Number(value);
  const valid =
    type === "SET_PRICING" || type === "SET_ACTIVE" ||
    (value.trim() !== "" && Number.isFinite(number) &&
      (type === "CHANGE_PERCENT" ? number !== 0 && number >= -90 && number <= 500 : type === "SET_HOURS" ? number > 0 : number >= 0));

  function action(): BulkAction {
    switch (type) {
      case "CHANGE_PERCENT": return { type, percent: number, roundTo };
      case "SET_RATE": return { type, rate: number };
      case "SET_HOURS": return { type, hours: number };
      case "SET_PRICING": return { type, pricing };
      case "SET_ACTIVE": return { type, active };
    }
  }

  const run = useMutation({
    mutationFn: (dryRun: boolean) =>
      bulkUpdateRates({ scope, action: action(), ...(dryRun ? { dryRun: true } : { expected: preview?.changing }) }),
    onSuccess: (result) => {
      if (!result.applied) {
        setPreview(result);
        return;
      }
      toast.success(`${result.changing.toLocaleString()} rates changed`);
      queryClient.invalidateQueries({ queryKey: labourRateKeys.all });
      onDone();
      close();
    },
    onError: (error) => {
      setPreview(null);
      toast.error(errorMessage(error, "The change failed; nothing was saved"));
    },
  });

  function close() {
    setPreview(null);
    setValue("");
    onClose();
  }

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPreview(null);
  };

  return (
    <ModalFame isOpen={isOpen} onClose={close} title="Change labour rates" description={`Applies to ${scopeLabel}.`} preventAccidentalClose={run.isPending}>
      <div className="grid gap-4">
        <Field label="Change">
          <select className={inputCls} value={type} onChange={(e) => reset(setType)(e.target.value as ActionType)}>
            {ACTIONS.map((a) => <option key={a.type} value={a.type}>{a.label}</option>)}
          </select>
        </Field>

        {type === "CHANGE_PERCENT" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Percent (−90 to 500)">
              <NumberInput step="0.01" className={inputCls} value={value} placeholder="e.g. 5 or -10" onChange={(e) => reset(setValue)(e.target.value)} />
            </Field>
            <Field label="Round the result to">
              <select className={inputCls} value={roundTo} onChange={(e) => reset(setRoundTo)(Number(e.target.value))}>
                {ROUNDING.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
          </div>
        )}
        {(type === "SET_RATE" || type === "SET_HOURS") && (
          <Field label={type === "SET_RATE" ? "Rate or fixed amount (₦)" : "Hours"}>
            <NumberInput step="0.01" min={type === "SET_HOURS" ? 0.01 : 0} className={inputCls} value={value} onChange={(e) => reset(setValue)(e.target.value)} />
          </Field>
        )}
        {type === "SET_PRICING" && (
          <Field label="Pricing">
            <select className={inputCls} value={pricing} onChange={(e) => reset(setPricing)(e.target.value as "TIME" | "FIXED")}>
              <option value="TIME">Time: hours × hourly rate</option>
              <option value="FIXED">Fixed amount</option>
            </select>
          </Field>
        )}
        {type === "SET_ACTIVE" && (
          <Field label="Status">
            <select className={inputCls} value={String(active)} onChange={(e) => reset(setActive)(e.target.value === "true")}>
              <option value="false">Deactivate</option>
              <option value="true">Activate</option>
            </select>
          </Field>
        )}

        {preview && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm" aria-live="polite">
            <p className="font-medium text-slate-800">
              {preview.changing.toLocaleString()} of {preview.matched.toLocaleString()} rates will change
              {preview.matched > preview.changing && <span className="font-normal text-slate-500"> (the rest already have this value)</span>}.
            </p>
            {preview.sample.length > 0 && (
              <table className="mt-2 w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr><th className="py-1 font-medium">Model</th><th className="font-medium">Labour</th><th className="text-right font-medium">Now</th><th className="text-right font-medium">New</th></tr>
                </thead>
                <tbody>
                  {preview.sample.map((s, i) => (
                    <tr key={i} className="border-t border-slate-200">
                      <td className="py-1 pr-2">{s.model}</td>
                      <td className="pr-2">{s.labour}</td>
                      <td className="text-right tabular-nums">{show(s.old)}</td>
                      <td className="text-right font-medium tabular-nums">{show(s.new)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {preview.changing > 5000 && <p className="mt-2 text-slate-500">A change this size can take up to a minute.</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!valid || run.isPending} onClick={() => run.mutate(true)}>
            {run.isPending && !preview ? "Previewing…" : "Preview"}
          </Button>
          <Button disabled={!preview || preview.changing === 0 || run.isPending} onClick={() => run.mutate(false)}>
            {run.isPending && preview ? "Applying…" : preview ? `Apply to ${preview.changing.toLocaleString()} rates` : "Apply"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
