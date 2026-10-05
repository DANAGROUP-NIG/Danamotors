"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { Field, inputCls } from "@/components/forms/FormField";
import { apiGet } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";

type Stock = {
  partId: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  part: { id: string; partNumber: string; name: string; uom: string; retailRate: number | null; partStatus: string };
};
const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

export function EstimatePartPicker({ branchId, value, onChange }: {
  branchId: string;
  value: string;
  onChange: (id: string, description: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Stock | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["job-card-issuable-parts", branchId, debouncedSearch],
    queryFn: () => apiGet<{ stockItems: Stock[] }>(`${API_ROUTES.inventory.stock.base}?${new URLSearchParams({ branchId, search: debouncedSearch, limit: "20" })}`),
    enabled: !!branchId && debouncedSearch.length >= 2 && !value,
    staleTime: 15_000,
    retry: false,
  });
  const searching = search.trim().length >= 2 && !value;
  const loading = query.isFetching || search.trim() !== debouncedSearch;
  function clear() { setSearch(""); setDebouncedSearch(""); setSelected(null); onChange("", ""); }
  return <div className="grid gap-2">
    <Field label="Find part by number or name">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <input className={`${inputCls} h-9 pl-9 pr-9`} value={search} maxLength={100} autoComplete="off" placeholder="Enter at least 2 characters" aria-label="Search inventory by part number or name" onChange={event => { setSearch(event.target.value); setSelected(null); onChange("", ""); }} />
        {(search || value) && <button type="button" aria-label="Clear part search" className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={clear}><X className="size-4" /></button>}
      </div>
    </Field>
    {value && selected?.partId === value && <p className="text-sm">{selected.part.partNumber} - {selected.part.name}</p>}
    {searching && <div aria-live="polite">
      {loading ? <p role="status" className="py-2 text-xs text-muted-foreground">Searching branch stock...</p> : query.isError ? <p role="alert" className="py-2 text-xs text-destructive">Inventory search failed. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p> : !query.data?.stockItems.length ? <p className="py-2 text-xs text-muted-foreground">No matching stocked parts in this branch.</p> : <ul className="max-h-48 overflow-y-auto rounded-md border" aria-label="Matching branch stock">
        {query.data.stockItems.map(row => <li key={row.partId}><button type="button" disabled={row.part.partStatus !== "ACTIVE" || row.part.retailRate == null} onClick={() => { setSelected(row); setSearch(""); setDebouncedSearch(""); onChange(row.partId, row.part.name); }} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-2 text-left last:border-0 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50">
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{row.part.partNumber} - {row.part.name}</span><span className="block text-xs text-muted-foreground">{row.part.uom} - Retail {row.part.retailRate == null ? "not set" : money.format(row.part.retailRate)}{row.part.partStatus !== "ACTIVE" ? " - Blocked" : ""}</span></span>
          <span className="text-xs text-muted-foreground">{Math.max(row.availableQuantity ?? row.quantity - row.reservedQuantity, 0)} available</span>
        </button></li>)}
      </ul>}
    </div>}
  </div>;
}
