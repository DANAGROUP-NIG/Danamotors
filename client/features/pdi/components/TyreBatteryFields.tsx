"use client";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import type { TyreDraft } from "../types/pdi.types";
import { PdiField, pdiInput } from "./pdi-ui";

export const TYRE_POSITIONS = ["Front left", "Front right", "Rear left", "Rear right", "Spare"] as const;
export const emptyTyres = (): TyreDraft[] => TYRE_POSITIONS.map(() => ({ makeId: "", number: "" }));

/** Other details (legacy): tyre make and number for up to five positions, and the battery. Saved to the vehicle. */
export function TyreBatteryFields({ tyres, onTyres, batteryMakeId, batteryNumber, onBattery, sizes, disabled }: {
  tyres: TyreDraft[];
  onTyres: (tyres: TyreDraft[]) => void;
  batteryMakeId: string;
  batteryNumber: string;
  onBattery: (value: { batteryMakeId: string; batteryNumber: string }) => void;
  sizes?: { front?: string; rear?: string };
  disabled?: boolean;
}) {
  const edit = (index: number, patch: Partial<TyreDraft>) => onTyres(tyres.map((tyre, position) => position === index ? { ...tyre, ...patch } : tyre));
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Tyre details</h3>
          {(sizes?.front || sizes?.rear) && (
            <p className="text-xs text-muted-foreground">Variant tyre size: front {sizes.front ?? "—"} · rear {sizes.rear ?? "—"}</p>
          )}
        </div>
        {TYRE_POSITIONS.map((position, index) => (
          <div key={position} className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
            <span className="text-sm font-medium text-muted-foreground">{position}</span>
            <WorkshopPicker label={`${position} tyre make`} hideLabel endpoint="/workshop-masters?kind=TYRE_MAKE" collection="items" value={tyres[index]?.makeId ?? ""} disabled={disabled} onChange={makeId => edit(index, { makeId })} />
            <input aria-label={`${position} tyre number`} className={`${pdiInput} uppercase`} placeholder="Tyre serial number" maxLength={100} disabled={disabled} value={tyres[index]?.number ?? ""} onChange={event => edit(index, { number: event.target.value })} />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Battery details</h3>
        <WorkshopPicker label="Battery make" endpoint="/workshop-masters?kind=BATTERY_MAKE" collection="items" value={batteryMakeId} disabled={disabled} onChange={id => onBattery({ batteryMakeId: id, batteryNumber })} />
        <PdiField label="Battery number">
          <input className={`${pdiInput} uppercase`} maxLength={100} disabled={disabled} value={batteryNumber} onChange={event => onBattery({ batteryMakeId, batteryNumber: event.target.value })} />
        </PdiField>
      </div>
    </div>
  );
}

/** Tyre rows worth sending: positions with a make or a number. Empty positions keep their place. */
export function tyrePayload(tyres: TyreDraft[]) {
  return tyres.some(tyre => tyre.makeId || tyre.number.trim())
    ? tyres.map(tyre => ({ makeId: tyre.makeId || undefined, number: tyre.number.trim() || undefined }))
    : undefined;
}
