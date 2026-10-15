"use client";

import { useState } from "react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { Coins } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { fmtNaira } from "./PartStatusBadge";
import { PART_SOURCE_CODES, partSourceLabel } from "../lib/part-codes";

type SourcePrice = { source: string; retailRate: number; dealerRate: number | null };
type SourcePrices = { partFlag: string; dealerRate: number; retailRate: number | null; prices: SourcePrice[] };
type Draft = Record<string, { retailRate: string; dealerRate: string }>;

const toDraft = (prices: SourcePrice[]): Draft =>
  Object.fromEntries(prices.map((p) => [p.source, { retailRate: String(p.retailRate), dealerRate: p.dealerRate == null ? "" : String(p.dealerRate) }]));

/** Prices for supplying this part from each source. The part's own source is its Part Master retail rate. */
export function PartSourcePrices({ partId, canEdit }: { partId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const queryKey = ["part-source-prices", partId];
  const query = useQuery({ queryKey, queryFn: () => apiGet<SourcePrices>(API_ROUTES.inventory.parts.sourcePrices(partId)) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = useMutation({
    mutationFn: (prices: { source: string; retailRate: number; dealerRate: number | null }[]) =>
      apiPut<SourcePrices>(API_ROUTES.inventory.parts.sourcePrices(partId), { prices }),
    onSuccess: async () => {
      toast.success("Source prices saved");
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["job-card-issuable-parts"] });
    },
  });
  const data = query.data;
  if (!data) return <p className="text-sm text-muted-foreground">{query.isError ? "Could not load source prices." : "Loading source prices..."}</p>;
  const otherSources = PART_SOURCE_CODES.filter((code) => code !== data.partFlag);
  const editing = draft !== null;

  function submit() {
    const prices = Object.entries(draft ?? {})
      .filter(([, value]) => value.retailRate.trim() !== "")
      .map(([source, value]) => ({ source, retailRate: Number(value.retailRate), dealerRate: value.dealerRate.trim() === "" ? null : Number(value.dealerRate) }));
    if (prices.some((p) => !Number.isFinite(p.retailRate) || p.retailRate < 0 || (p.dealerRate != null && (!Number.isFinite(p.dealerRate) || p.dealerRate < 0)))) {
      toast.error("Prices must be numbers of 0 or more");
      return;
    }
    save.mutate(prices);
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Each source has its own price on estimates and job cards. Leave a price blank if the part is not supplied from that source.
        Sources are internal and are not shown to customers.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2 pr-3 font-medium">Source</th>
              <th className="py-2 pr-3 font-medium">Price (retail)</th>
              <th className="py-2 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2 pr-3">{partSourceLabel(data.partFlag)} <span className="text-xs text-muted-foreground">(part&apos;s own source)</span></td>
              <td className="py-2 pr-3">{data.retailRate != null ? fmtNaira(data.retailRate) : "Not set"}</td>
              <td className="py-2">{fmtNaira(data.dealerRate)}</td>
            </tr>
            {otherSources.map((code) => {
              const saved = data.prices.find((p) => p.source === code);
              const value = draft?.[code] ?? { retailRate: "", dealerRate: "" };
              const set = (field: "retailRate" | "dealerRate", next: string) => setDraft((current) => ({ ...current, [code]: { ...value, [field]: next } }));
              return (
                <tr key={code} className="border-b last:border-0">
                  <td className="py-2 pr-3">{partSourceLabel(code)}</td>
                  {editing ? (
                    <>
                      <td className="py-2 pr-3"><input type="number" min="0" step="0.01" className={`${inputCls} h-8`} aria-label={`${partSourceLabel(code)} price`} value={value.retailRate} onChange={(e) => set("retailRate", e.target.value)} /></td>
                      <td className="py-2"><input type="number" min="0" step="0.01" className={`${inputCls} h-8`} aria-label={`${partSourceLabel(code)} cost`} value={value.dealerRate} onChange={(e) => set("dealerRate", e.target.value)} /></td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 pr-3">{saved ? fmtNaira(saved.retailRate) : <span className="text-muted-foreground">Not supplied</span>}</td>
                      <td className="py-2">{saved?.dealerRate != null ? fmtNaira(saved.dealerRate) : "—"}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-destructive">
          {isAxiosError(save.error) ? save.error.response?.data?.message || "Could not save source prices" : "Could not save source prices"}
        </p>
      )}
      {canEdit && (
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button type="button" size="sm" disabled={save.isPending} onClick={submit}>Save prices</Button>
              <Button type="button" size="sm" variant="outline" disabled={save.isPending} onClick={() => setDraft(null)}>Cancel</Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setDraft(toDraft(data.prices))}>
              <Coins className="size-4" /> Edit source prices
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
