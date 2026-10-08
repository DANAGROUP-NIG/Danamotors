"use client";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/apiClient";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";

type CatalogueVariant = {
  id: string; code: string; description: string; make: string; model: string;
  active: boolean; colours: { id: string; code: string; description: string; active: boolean }[];
};
export function VehicleCatalogueFields({ catalogueId, colourId, onChange, disabled, required = true, variantError, colourError }: {
  catalogueId?: string | null;
  colourId?: string | null;
  onChange: (catalogueId: string | null, colourId: string | null) => void;
  disabled?: boolean;
  required?: boolean;
  variantError?: string;
  colourError?: string;
}) {
  const detail = useQuery({
    queryKey: ["vehicle-workshop-catalogue", catalogueId],
    queryFn: ({ signal }) => apiGet<{ item: CatalogueVariant }>(`/vehicle-catalog/workshop-variants/${catalogueId}`, { signal }),
    enabled: !!catalogueId,
    staleTime: 60_000,
    retry: 1,
  });
  const variant = detail.data?.item;
  const colours = variant?.colours.filter(colour => colour.active) ?? [];
  const savedColour = variant?.colours.find(colour => colour.id === colourId);
  const variantLabel = variant ? { id: variant.id, code: variant.code,
    make: variant.make, model: variant.model,
    description: `${variant.description}${variant.active ? "" : " (inactive)"}` } : undefined;
  return <div className="grid gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2"><WorkshopPicker
      label="Vehicle catalogue" required={required} value={catalogueId ?? ""} disabled={disabled}
      endpoint="/vehicle-catalog/workshop-variants" collection="items"
      requestLimit={20} loadOnValue={false} staleTime={60_000}
      selectedRecord={variantLabel} error={variantError}
      onChange={id => { if (id !== catalogueId) onChange(id || null, null); }}
      formatLabel={row => [row.make, row.model, row.description].filter(Boolean).join(" / ")}
      renderOption={row => <span><span className="block font-medium">{row.make} / {row.model} / {row.description}</span>
        <span className="text-sm text-muted-foreground">{row.code}</span></span>}
    /></div>
    <WorkshopPicker label="Catalogue colour" required={required && !!catalogueId}
      endpoint="/vehicle-catalog/workshop-variants" collection="items"
      value={colourId ?? ""} selectedRecord={savedColour}
      disabled={disabled || !catalogueId || detail.isPending || detail.isError}
      localOptions={colours} error={colourError}
      onChange={id => onChange(catalogueId ?? null, id || null)}
      emptyMessage="No active colours configured for this model. Update the catalogue in Settings."
    />
    {catalogueId && detail.isPending && <p role="status" className="text-sm text-muted-foreground">Loading catalogue details...</p>}
    {detail.isError && <p role="alert" className="text-sm text-destructive">Could not load the selected catalogue entry. <button type="button" className="underline" onClick={() => detail.refetch()}>Retry</button></p>}
    {variant && !variant.active && <p className="text-sm text-muted-foreground">This saved catalogue entry is inactive. Choose an active entry to change the vehicle model or colour.</p>}
  </div>;
}
