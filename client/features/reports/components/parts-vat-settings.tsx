"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/api/apiClient";
import { PageHeader } from "@/components/headers/page-header";
import { Field, inputCls } from "@/components/forms/FormField";
import { NumberInput } from "@/components/forms/NumberInput";
import { Button } from "@/components/ui/button";
type Settings = {
  enabled: boolean;
  rates: { SPARES: number; OIL: number; ACCESSORIES: number };
};
export function PartsVatSettings() {
  const query = useQuery({
    queryKey: ["parts-vat-settings"],
    queryFn: () => apiGet<Settings>("/reports/billing-settings"),
  });
  const preflight = useQuery({
    queryKey: ["parts-vat-preflight"],
    enabled: query.isSuccess,
    queryFn: () => apiGet<{ count: number; parts: { id: string; partNumber: string; name: string }[] }>("/reports/billing-settings/preflight"),
  });
  const [draft, setDraft] = useState<Settings | null>(null);
  const current = draft ?? query.data;
  const save = useMutation({
    mutationFn: () => apiPut<Settings>("/reports/billing-settings", current),
    onSuccess: () => query.refetch(),
  });
  return (
    <div className="space-y-6 p-4 lg:p-8">
      <Link href="/reports" className="text-sm text-primary underline">
        All reports
      </Link>
      <PageHeader
        title="Parts VAT settings"
        description="New estimates save the tax settings used for their bills. Existing invoices retain their stored amounts."
      />
      {query.isLoading ? (
        <p>Loading settings…</p>
      ) : query.isError ? (
        <p role="alert">
          Settings unavailable. Admin or SuperAdmin access is required.
        </p>
      ) : (
        current && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6"
          >
            <section className="space-y-2 rounded-md border border-border p-3 text-sm">
              {preflight.isPending ? <p role="status">Checking part tax categories</p> :
                preflight.isError ? (
                  <p role="alert">Unable to check part tax categories.{" "}
                    <button type="button" className="underline" onClick={() => void preflight.refetch()}>Retry</button>
                  </p>
                ) : preflight.data.count ? (
                  <details>
                    <summary className="cursor-pointer font-medium">{preflight.data.count} retail parts need a tax category</summary>
                    <p className="mt-2">Classify these parts in Part Master before enabling parts VAT.</p>
                    <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto break-words">
                      {preflight.data.parts.map(part => <li key={part.id}>{part.partNumber} {part.name}</li>)}
                    </ul>
                  </details>
                ) : <p role="status">All retail parts have a billing tax category.</p>}
            </section>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={current.enabled}
                onChange={(e) =>
                  setDraft({ ...current, enabled: e.target.checked })
                }
              />
              Enable parts VAT on new estimates
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              {([["SPARES", "Spares"], ["OIL", "Oil"], ["ACCESSORIES", "Accessories"]] as const).map(([k, label]) => (
                <Field key={k} label={label + " VAT (%)"}>
                  <NumberInput
                    className={inputCls}
                    min={0}
                    max={100}
                    step="0.01"
                    required
                    value={current.rates[k]}
                    onValueChange={(v) =>
                      setDraft({
                        ...current,
                        rates: {
                          ...current.rates,
                          [k]: v ?? 0,
                        },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            <Button disabled={save.isPending || (current.enabled && (!preflight.isSuccess || preflight.data.count > 0))}>Save settings</Button>
            {save.isSuccess && (
              <p role="status" className="text-sm">
                Settings saved.
              </p>
            )}
            {save.isError && (
              <p role="alert" className="text-sm text-destructive">
                {save.error.message}
              </p>
            )}
          </form>
        )
      )}
    </div>
  );
}
