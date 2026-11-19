"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { WorkshopPicker, type PickerRecord } from "@/features/job-cards/components/WorkshopPicker";
import { useCreatePdiVehicle } from "../hooks/use-pdi";
import type { PdiVehicle } from "../types/pdi.types";
import { PdiField, pdiInput } from "./pdi-ui";

type ParentRecord = PickerRecord & { parent?: { id: string; description: string } | null; parentId?: string | null };

/** A new vehicle for its first PDI: from the catalogue variant and colour, with engine number. No plate yet. */
export function NewVehicleDialog({ open, vin, onClose, onCreated }: { open: boolean; vin: string; onClose: () => void; onCreated: (vehicle: PdiVehicle) => void }) {
  const create = useCreatePdiVehicle();
  const [form, setForm] = useState({ vin, catalogueId: "", modelId: "", colourId: "", engineNumber: "", acType: "FACTORY" as "FACTORY" | "DEALER" | "NONE" });
  const [touched, setTouched] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));
  const errors = {
    vin: form.vin.trim().length < 11 ? "Enter the full VIN" : undefined,
    catalogueId: form.catalogueId ? undefined : "Choose the variant",
    colourId: form.colourId ? undefined : "Choose the colour",
    engineNumber: form.engineNumber.trim() ? undefined : "Enter the engine number",
  };
  const valid = !Object.values(errors).some(Boolean);

  return (
    <ModalFame isOpen={open} onClose={onClose} title="New vehicle for PDI" description="The vehicle has no registration yet; the PDI job card carries a temporary PDI registration." preventAccidentalClose>
      <form
        className="space-y-4"
        onSubmit={event => {
          event.preventDefault();
          setTouched(true);
          if (!valid) return;
          create.mutate({ vin: form.vin.trim().toUpperCase(), catalogueId: form.catalogueId, colourId: form.colourId, engineNumber: form.engineNumber.trim().toUpperCase(), acType: form.acType }, { onSuccess: vehicle => onCreated(vehicle) });
        }}
      >
        <PdiField label="VIN" required error={touched ? errors.vin : undefined}>
          <input className={`${pdiInput} font-mono uppercase`} value={form.vin} maxLength={50} onChange={event => set({ vin: event.target.value })} />
        </PdiField>
        <WorkshopPicker
          label="Model and variant"
          required
          endpoint="/workshop-masters?kind=VARIANT"
          collection="items"
          value={form.catalogueId}
          error={touched ? errors.catalogueId : undefined}
          formatLabel={row => [(row as ParentRecord).parent?.description, row.description].filter(Boolean).join(" · ")}
          onChange={id => set({ catalogueId: id, colourId: "" })}
          onSelect={row => set({ modelId: (row as ParentRecord).parent?.id ?? (row as ParentRecord).parentId ?? "" })}
        />
        <WorkshopPicker
          label="Colour"
          required
          endpoint={form.modelId ? `/workshop-masters?kind=COLOUR&parentId=${form.modelId}` : "/workshop-masters?kind=COLOUR"}
          collection="items"
          value={form.colourId}
          disabled={!form.catalogueId}
          error={touched ? errors.colourId : undefined}
          onChange={id => set({ colourId: id })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <PdiField label="Engine number" required error={touched ? errors.engineNumber : undefined}>
            <input className={`${pdiInput} uppercase`} maxLength={100} value={form.engineNumber} onChange={event => set({ engineNumber: event.target.value })} />
          </PdiField>
          <PdiField label="A/C">
            <select className={pdiInput} value={form.acType} onChange={event => set({ acType: event.target.value as typeof form.acType })}>
              <option value="FACTORY">Factory fitted</option>
              <option value="DEALER">Dealer fitted</option>
              <option value="NONE">No A/C</option>
            </select>
          </PdiField>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={create.isPending}>{create.isPending ? "Creating…" : "Create vehicle"}</Button>
        </div>
      </form>
    </ModalFame>
  );
}
