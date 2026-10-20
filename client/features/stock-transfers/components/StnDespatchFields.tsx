"use client";

import { Field, inputCls } from "@/components/forms/FormField";
import { TRANSPORT_MODE_LABELS } from "../lib/indent-status";
import type { TransportMode } from "../types/indent.types";

export type DespatchValues = {
  transportMode: TransportMode | "";
  waybillNumber: string;
  courierName: string;
  packerName: string;
  taxForm: string;
};

// Legacy STNs between branches use tax form X and go by road.
export const DEFAULT_DESPATCH: DespatchValues = {
  transportMode: "ROAD",
  waybillNumber: "",
  courierName: "",
  packerName: "",
  taxForm: "X",
};

export function despatchPayload(v: DespatchValues) {
  const opt = (s: string) => s.trim() || undefined;
  return {
    transportMode: v.transportMode || undefined,
    waybillNumber: opt(v.waybillNumber),
    courierName: opt(v.courierName),
    packerName: opt(v.packerName),
    taxForm: opt(v.taxForm),
  };
}

/** Packing list cum gate pass details shared by every way of dispatching an STN. */
export function StnDespatchFields({ value, onChange }: { value: DespatchValues; onChange: (v: DespatchValues) => void }) {
  const set = (patch: Partial<DespatchValues>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Mode of transport">
        <select className={inputCls} value={value.transportMode} onChange={(e) => set({ transportMode: e.target.value as TransportMode })}>
          {Object.entries(TRANSPORT_MODE_LABELS).map(([mode, label]) => (
            <option key={mode} value={mode}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Waybill no. (optional)">
        <input className={inputCls} maxLength={30} value={value.waybillNumber} onChange={(e) => set({ waybillNumber: e.target.value })} />
      </Field>
      <Field label="Courier / logistics (optional)">
        <input className={inputCls} maxLength={60} value={value.courierName} onChange={(e) => set({ courierName: e.target.value })} />
      </Field>
      <Field label="Packer (optional)">
        <input className={inputCls} maxLength={60} value={value.packerName} onChange={(e) => set({ packerName: e.target.value })} />
      </Field>
      <Field label="Tax form">
        <input className={inputCls} maxLength={2} value={value.taxForm} onChange={(e) => set({ taxForm: e.target.value.toUpperCase() })} />
      </Field>
    </div>
  );
}
