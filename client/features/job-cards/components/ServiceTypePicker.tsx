"use client";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/apiClient";
import { WorkshopPicker } from "./WorkshopPicker";
import Link from 'next/link';

export type ServiceTypeOption = {
  id: string;
  code: string;
  description: string;
  chargedTo: "CUSTOMER" | "COMPANY";
  serviceCharge: number;
};

export function ServiceTypePicker({ vehicleId, date, value, serviceCharge, onChange, onCharge, onBlur, error, canConfigure = false }: {
  vehicleId?: string;
  date: string;
  value?: string;
  serviceCharge?: number;
  onChange: (id: string) => void;
  onCharge: (charge: number | undefined) => void;
  onBlur: () => void;
  error?: string;
  canConfigure?: boolean;
}) {
  const query = useQuery({
    queryKey: ["job-card-service-types", vehicleId, date],
    queryFn: ({ signal }) => apiGet<{ items: ServiceTypeOption[]; message: string | null; reason?: 'READY' | 'MODEL_NOT_CONFIGURED' | 'NO_SERVICE_SETTINGS' }>(
      `/job-cards/service-types?vehicleId=${vehicleId}&date=${date}`,
      { signal },
    ),
    enabled: !!vehicleId,
    staleTime: 30_000,
  });
  const context = `${vehicleId ?? ""}:${date}`;
  const appliedContext = useRef(context);
  const selected = query.data?.items.find(item => item.id === value);
  useEffect(() => {
    if (!vehicleId) {
      if (value) { onChange(""); onCharge(undefined); }
      appliedContext.current = context;
      return;
    }
    if (!query.data) return;
    if (value && !selected) {
      onChange("");
      onCharge(undefined);
    } else if (selected && (appliedContext.current !== context || serviceCharge === undefined)) {
      onCharge(selected.serviceCharge);
    }
    appliedContext.current = context;
  }, [context, vehicleId, query.data, value, selected, serviceCharge, onChange, onCharge]);

  return <div className="space-y-2">
    <WorkshopPicker
      label="Service" required endpoint="/job-cards/service-types" collection="items"
      value={value} onChange={id => {
        onChange(id);
        onCharge(query.data?.items.find(item => item.id === id)?.serviceCharge);
      }}
      onBlur={onBlur} error={error} disabled={!vehicleId || query.isPending}
      localOptions={query.data?.items ?? []} optionsLoading={query.isFetching}
      optionsError={query.isError} onRetry={() => { void query.refetch(); }}
      emptyMessage={query.data?.message ?? "No matching service types"}
      formatLabel={row => `${row.description} (${row.code})`}
      renderOption={row => <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="font-medium">{row.description}</span>{" "}
        <span className="shrink-0 font-mono text-muted-foreground">{row.code}</span>
      </span>}
    />
    {!vehicleId && <p className="text-sm text-muted-foreground">Select a vehicle to see available service types.</p>}
    {vehicleId && query.isPending && <p role="status" className="text-sm text-muted-foreground">Loading service types...</p>}
    {vehicleId && query.isError && <p role="alert" className="text-sm text-destructive">Could not load service types. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>}
    {query.data?.message && <p role="status" className="text-sm text-muted-foreground">{query.data.message}</p>}
    {query.data?.message && <div className="flex flex-wrap items-center gap-3 text-sm">
      {canConfigure && <Link href="/settings/workshop-masters" target="_blank" rel="noopener noreferrer" className="underline">Configure model services</Link>}
      <button type="button" disabled={query.isFetching} className="underline" onClick={() => query.refetch()}>Refresh services</button>
    </div>}
    <p className="text-sm">Charged to: <span className="font-medium">{selected ? selected.chargedTo === "COMPANY" ? "Company" : "Customer" : "—"}</span></p>
  </div>;
}
