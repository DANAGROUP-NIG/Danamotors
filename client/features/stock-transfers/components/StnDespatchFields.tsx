"use client";

import { Field, inputCls } from "@/components/forms/FormField";
import { NumberInput } from "@/components/forms/NumberInput";
import { StaffNameInput } from "./CaseSplitter";
import { DEFAULT_STN_TAX_FORM, STN_TAX_FORMS, TRANSPORT_MODE_LABELS } from "../lib/indent-status";
import type { TransportMode } from "../types/indent.types";

export type DespatchValues = {
  transportMode: TransportMode | "";
  waybillNumber: string;
  courierName: string;
  packerName: string;
  taxForm: string;
  /** Legacy Courier Date; blank = the dispatch date. */
  courierDate: string;
  consignmentWeight: string;
};

// Legacy STNs between branches use tax form X and go by road.
export const DEFAULT_DESPATCH: DespatchValues = {
  transportMode: "ROAD",
  waybillNumber: "",
  courierName: "",
  packerName: "",
  taxForm: DEFAULT_STN_TAX_FORM,
  courierDate: "",
  consignmentWeight: "",
};

export function despatchPayload(v: DespatchValues) {
  const opt = (s: string) => s.trim() || undefined;
  return {
    transportMode: v.transportMode || undefined,
    waybillNumber: opt(v.waybillNumber),
    courierName: opt(v.courierName),
    packerName: opt(v.packerName),
    taxForm: opt(v.taxForm),
    courierDate: opt(v.courierDate),
    consignmentWeight: v.consignmentWeight.trim() ? Number(v.consignmentWeight) : undefined,
  };
}

/** Legacy tax form for an STN; L and Z add 7.5% VAT on taxable parts. */
export function TaxFormSelect({ value, onChange }: { value: string; onChange: (form: string) => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(STN_TAX_FORMS).map(([code, label]) => (
        <option key={code} value={code}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** Packing list cum gate pass details shared by every way of dispatching an STN. */
export function StnDespatchFields({
  value,
  onChange,
  branchId,
}: {
  value: DespatchValues;
  onChange: (v: DespatchValues) => void;
  /** Supplying branch, whose employees are offered as the packer. */
  branchId?: string;
}) {
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
        <StaffNameInput branchId={branchId} value={value.packerName} onChange={(packerName) => set({ packerName })} />
      </Field>
      <Field label="Courier date (blank = today)">
        <input type="date" className={inputCls} value={value.courierDate} onChange={(e) => set({ courierDate: e.target.value })} />
      </Field>
      <Field label="Consignment weight, kg (optional)">
        <NumberInput
          min={0}
          step="0.1"
          className={inputCls}
          value={value.consignmentWeight}
          onChange={(e) => set({ consignmentWeight: e.target.value })}
        />
      </Field>
      <Field label="Tax form">
        <TaxFormSelect value={value.taxForm} onChange={(taxForm) => set({ taxForm })} />
      </Field>
    </div>
  );
}
