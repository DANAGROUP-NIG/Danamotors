"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { DateTimeInput } from "@/components/forms/DateTimeInput";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { useUpdatePdi } from "../hooks/use-pdi";
import { defectLineValid } from "../lib/pdi.logic";
import type { DefectDraft, PdiJob, TyreDraft } from "../types/pdi.types";
import { DefectsGrid } from "./DefectsGrid";
import { PdiField, pdiInput, pdiNumberInput } from "./pdi-ui";
import { TyreBatteryFields, emptyTyres, tyrePayload } from "./TyreBatteryFields";

/** Edits a PDI job card. The server applies the freeze date and the edit before/after print rules. */
export function PdiEditDialog({ job, onClose }: { job: PdiJob; onClose: () => void }) {
  const update = useUpdatePdi(job.id);
  const [form, setForm] = useState({
    pdiRegistration: job.pdiRegistration ?? "", mileage: String(job.mileage ?? ""), promisedAt: job.promisedAt ?? "", bayId: job.bayId ?? "",
    teamId: job.teamId ?? "", engineerId: job.engineerId ?? "", remarks: job.remarks ?? "", batteryNumber: job.batteryNumber ?? "", batteryMakeId: "",
  });
  const [defects, setDefects] = useState<DefectDraft[]>(job.complaints.map(line => ({
    key: line.id, defectId: line.complaintCode?.id ?? "", description: line.description, group: line.complaintCode?.parent?.description ?? null,
    spare: Number(line.spare), oil: Number(line.oil), labour: Number(line.labour),
  })));
  const [tyres, setTyres] = useState<TyreDraft[]>(() => {
    const saved = (job.tyres ?? []).map(tyre => ({ makeId: tyre.makeId, number: tyre.number }));
    return [...saved, ...emptyTyres()].slice(0, 5);
  });
  const set = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));
  const valid = form.pdiRegistration.trim() && form.mileage !== "" && defects.length > 0 && defects.every(defectLineValid);

  return (
    <ModalFame isOpen onClose={onClose} title={`Edit ${job.jobNumber}`} description="Changes are refused on or before the PDI job freeze date, and after printing unless PDI settings allow it." size="wide" preventAccidentalClose>
      <form
        className="space-y-6"
        onSubmit={event => {
          event.preventDefault();
          if (!valid) return;
          update.mutate({
            pdiRegistration: form.pdiRegistration.trim().toUpperCase(),
            mileage: Number(form.mileage),
            promisedAt: form.promisedAt ? new Date(form.promisedAt).toISOString() : undefined,
            bayId: form.bayId || undefined,
            teamId: form.teamId || undefined,
            engineerId: form.engineerId || undefined,
            remarks: form.remarks.trim() || null,
            defects: defects.map(row => ({ defectId: row.defectId || undefined, description: row.description.trim() || undefined, spare: row.spare, oil: row.oil, labour: row.labour })),
            tyres: tyrePayload(tyres),
            batteryNumber: form.batteryNumber.trim() || null,
            ...(form.batteryMakeId ? { batteryMakeId: form.batteryMakeId } : {}),
          }, { onSuccess: onClose });
        }}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <PdiField label="PDI registration" required><input className={`${pdiInput} font-mono uppercase`} maxLength={20} value={form.pdiRegistration} onChange={event => set({ pdiRegistration: event.target.value })} /></PdiField>
          <PdiField label="Mileage (km)" required hint="Cannot go below the reading at opening"><input className={pdiNumberInput} inputMode="numeric" value={form.mileage} onChange={event => set({ mileage: event.target.value.replace(/[^0-9]/g, "") })} /></PdiField>
          <PdiField label="Promised date and time"><DateTimeInput value={form.promisedAt} onChange={promisedAt => set({ promisedAt })} /></PdiField>
          <WorkshopPicker label="Bay" endpoint="/workshop-masters?kind=BAY" collection="items" value={form.bayId} onChange={bayId => set({ bayId })} />
          <WorkshopPicker label="Group" endpoint="/workshop-masters?kind=TEAM" collection="items" value={form.teamId} onChange={teamId => set({ teamId })} />
          <WorkshopPicker label="Engineer" endpoint={`/service/staff?role=Engineer&branchId=${job.branchId}`} collection="users" value={form.engineerId} onChange={engineerId => set({ engineerId })} />
          <PdiField label="Remarks" className="md:col-span-3"><textarea className={`${pdiInput} h-20 py-2`} maxLength={5000} value={form.remarks} onChange={event => set({ remarks: event.target.value })} /></PdiField>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold">Defects detected</h3>
          <DefectsGrid value={defects} onChange={setDefects} vehicleId={job.vehicle?.id} showErrors />
        </div>
        <TyreBatteryFields tyres={tyres} onTyres={setTyres} batteryMakeId={form.batteryMakeId} batteryNumber={form.batteryNumber} onBattery={value => set(value)} />
        {job.batteryMake && !form.batteryMakeId && <p className="-mt-3 text-xs text-muted-foreground">Battery make on file: {job.batteryMake}. Choose a make only to change it.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || update.isPending}>{update.isPending ? "Saving…" : "Save changes"}</Button>
        </div>
      </form>
    </ModalFame>
  );
}
