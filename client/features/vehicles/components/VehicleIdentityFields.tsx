"use client";
import { useState } from "react";
import { VehicleModelFields, type ModelSelection } from "./VehicleModelFields";
import { VehicleCatalogueFields } from "./VehicleCatalogueFields";

export type VehicleIdentitySelection = ModelSelection & { catalogueId?: string | null; colourId?: string | null };
export function VehicleIdentityFields({ value, onChange, selectedName, disabled, modelError, catalogueError, colourError }: {
  value: VehicleIdentitySelection;
  onChange: (value: VehicleIdentitySelection) => void;
  selectedName?: string | null;
  disabled?: boolean;
  modelError?: string;
  catalogueError?: string;
  colourError?: string;
}) {
  const [source, setSource] = useState(value.catalogueId ? 'workshop' : 'model');
  return <fieldset disabled={disabled} className="space-y-3">
    <label className="grid gap-1 text-sm font-medium">Vehicle catalogue source
      <select className="rounded-lg border border-border bg-background p-2" value={source}
        onChange={event => { setSource(event.target.value); onChange({ modelId: null, generationId: null, engineId: null, customModel: null, customMake: null, catalogueId: null, colourId: null }); }}>
        <option value="model">Kia model catalogue and specifications</option>
        <option value="workshop">Workshop variants</option>
      </select>
    </label>
    {source === 'model' && <p className="text-sm text-muted-foreground">Search the vehicle catalogue, then choose its generation and engine. Make and specifications are loaded from the selected records.</p>}
    {source === 'workshop' && <p className="text-sm text-muted-foreground">This vehicle uses a workshop variant. Select the Kia model catalogue above to replace its model, generation and engine.</p>}
    {source === 'model' ? <VehicleModelFields value={value} selectedName={selectedName} error={modelError}
      onChange={next => onChange({ ...next, catalogueId: null, colourId: null })} />
      : <VehicleCatalogueFields catalogueId={value.catalogueId} colourId={value.colourId} disabled={disabled}
        variantError={catalogueError} colourError={colourError}
        onChange={(catalogueId, colourId) => onChange({ modelId: null, generationId: null, engineId: null, customModel: null, customMake: null, catalogueId, colourId })} />}
  </fieldset>;
}
