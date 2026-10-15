"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import { inputCls } from "@/components/forms/FormField";
import { partSourceLabel } from "@/features/inventory/lib/part-codes";

type SourcePrices = { partFlag: string; retailRate: number | null; prices: { source: string; retailRate: number }[] };
const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

/** Every source the part has a price for, e.g. Mobis, local purchase, used, repaired. Staff-only. */
export function sourceOptions(data: SourcePrices) {
  return [
    ...(data.retailRate != null ? [{ source: data.partFlag, rate: data.retailRate }] : []),
    ...data.prices.map((p) => ({ source: p.source, rate: p.retailRate })),
  ];
}

export function PartSourceSelect({ partId, value, onChange }: { partId: string; value?: string; onChange: (source: string) => void }) {
  const query = useQuery({
    queryKey: ["part-source-prices", partId],
    queryFn: () => apiGet<SourcePrices>(API_ROUTES.inventory.parts.sourcePrices(partId)),
    staleTime: 60_000,
  });
  const options = query.data ? sourceOptions(query.data) : [];
  const first = options[0]?.source;
  // A newly added part starts at its own source, or the first source with a price.
  useEffect(() => {
    if (!value && first) onChange(first);
  }, [value, first, onChange]);
  if (query.isError) return <span className="text-xs text-destructive">Source prices unavailable</span>;
  if (!query.data) return <span className="text-xs text-muted-foreground">Loading sources...</span>;
  const missing = value && !options.some((o) => o.source === value);
  return (
    <select
      className={`${inputCls} h-8 w-auto text-xs`}
      aria-label="Part source"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
    >
      {missing && <option value={value}>{partSourceLabel(value)} · price not set</option>}
      {options.map((o) => (
        <option key={o.source} value={o.source}>
          {partSourceLabel(o.source)} · {money.format(o.rate)}
        </option>
      ))}
    </select>
  );
}
