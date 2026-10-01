"use client";

import { useState } from "react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { useUpdateVehicleWarranty, useVehicleModels } from "../hooks/use-warranty";
import { toDateInput } from "../lib/warranty-format";
import type { UpdateVehicleWarrantyPayload, WarrantyCheck } from "../types/warranty.types";

type OverrideMode = "NONE" | "EXTENDED" | "GOODWILL";

/**
 * Edits the inputs coverage is calculated from: model policy and sale date (warranty:update),
 * and an extended warranty or goodwill override (warranty:settings).
 */
export function VehicleWarrantyDialog({ check, onClose }: { check: WarrantyCheck; onClose: () => void }) {
  const { hasPermission, isSuperAdmin } = useAuth();
  const canUpdate = isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.UPDATE);
  const canOverride = isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.SETTINGS);
  const { data: models = [] } = useVehicleModels();
  const update = useUpdateVehicleWarranty(check.vehicle.id);

  const [modelId, setModelId] = useState(check.policy?.id ?? "");
  const [startDate, setStartDate] = useState(check.coverage.startDate ?? "");
  const [mode, setMode] = useState<OverrideMode>(check.override?.type ?? "NONE");
  const [until, setUntil] = useState(toDateInput(check.override?.until));
  const [km, setKm] = useState(check.override?.km != null ? String(check.override.km) : "");
  const [reason, setReason] = useState(check.override?.reason ?? "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const body: UpdateVehicleWarrantyPayload = {};
    if (canUpdate) {
      body.vehicleModelId = modelId || null;
      body.warrantyStartDate = startDate || null;
    }
    if (canOverride) {
      if (mode === "NONE") {
        if (check.override) body.override = null;
      } else {
        if (reason.trim().length < 3) return setError("Give a reason (certificate number, approval reference…)");
        if (mode === "GOODWILL" && !until) return setError("Goodwill needs an end date");
        if (mode === "EXTENDED" && !until && !km) return setError("An extended warranty needs an end date or a km limit");
        body.override = { type: mode, until: until || null, km: km ? Number(km) : null, reason: reason.trim() };
      }
    }
    setError(null);
    update.mutate(body, { onSuccess: onClose });
  }

  return (
    <ModalFame isOpen onClose={onClose} title="Vehicle warranty details">
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vehicle model (warranty policy)">
            <select className={inputCls} value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!canUpdate}>
              <option value="">Not linked</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.make} {m.name} ({m.code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Warranty start (sale) date">
            <DateInput value={startDate} onChange={setStartDate} disabled={!canUpdate} />
          </Field>
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-4" disabled={!canOverride}>
          <legend className="px-1 text-sm font-semibold text-slate-700">Extended warranty or goodwill</legend>
          {!canOverride && <p className="mb-3 text-xs text-slate-400">Needs warranty:settings.</p>}
          <div className="mb-4 inline-flex rounded-lg border border-slate-200 p-1">
            {(["NONE", "EXTENDED", "GOODWILL"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-primary text-primary-foreground" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {m === "NONE" ? "None" : m === "EXTENDED" ? "Extended warranty" : "Goodwill"}
              </button>
            ))}
          </div>
          {mode !== "NONE" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={mode === "GOODWILL" ? "Covered until" : "Extended until (optional)"}>
                <DateInput value={until} onChange={setUntil} />
              </Field>
              <Field label="Km limit (optional)">
                <input className={inputCls} inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 150000" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Reason">
                  <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Extended warranty certificate EW-2231" />
                </Field>
              </div>
            </div>
          )}
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={update.isPending || (!canUpdate && !canOverride)}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
