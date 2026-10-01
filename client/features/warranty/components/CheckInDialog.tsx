"use client";

import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { useUpdateAppointment } from "@/features/appointments/hooks/use-update-appointment";
import type { Appointment } from "@/features/appointments/types/appointment.types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { useVehicleWarranty } from "../hooks/use-warranty";
import { fmtDateTime, fmtKm } from "../lib/warranty-format";
import type { WarrantyCheck } from "../types/warranty.types";
import { WarrantyCheckPanel, ackRequiredCheck } from "./WarrantyCheckPanel";

/**
 * Screen 03 — check a vehicle in: record the odometer, show warranty status and open
 * campaigns, and require the customer to be informed before confirming.
 */
export function CheckInDialog({ appointment, onClose }: { appointment: Appointment; onClose: () => void }) {
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const canSeeWarranty = isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.READ);
  const update = useUpdateAppointment(appointment.id);
  const [mileage, setMileage] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [serverCheck, setServerCheck] = useState<WarrantyCheck | null>(null);

  const parsed = /^\d+$/.test(mileage.replace(/,/g, "")) ? Number(mileage.replace(/,/g, "")) : undefined;
  const debounced = useDebouncedValue(parsed, 450);
  const warranty = useVehicleWarranty(appointment.vehicleId, debounced, canSeeWarranty && debounced !== undefined);
  // Before a reading is typed, show the last recorded one for reference.
  const baseline = useVehicleWarranty(appointment.vehicleId, undefined, canSeeWarranty);
  const check = serverCheck ?? (debounced !== undefined ? warranty.data : undefined);

  useEffect(() => {
    setAcknowledged(false);
    setServerCheck(null);
  }, [debounced]);

  const vehicle = appointment.vehicle as { vin?: string; make?: string; model?: string; trim?: string; registrationNumber?: string } | undefined;
  const lastRecorded = baseline.data?.vehicle.lastRecordedMileage ?? null;
  const tooLow = parsed !== undefined && lastRecorded !== null && parsed < lastRecorded;
  const needsAck = Boolean(check?.requiresAcknowledgement) && !acknowledged;

  function confirm() {
    if (parsed === undefined) return toast.error("Enter the current mileage");
    if (tooLow) return toast.error(`Mileage cannot be lower than the last recorded ${fmtKm(lastRecorded)}`);
    update.mutate(
      {
        status: "Checked In",
        mileage: parsed,
        warrantyAcknowledged: acknowledged && check?.coverage.status === "ACTIVE",
        acknowledgedCampaignIds: acknowledged ? (check?.openCampaigns ?? []).map((c) => c.campaignId) : [],
      },
      {
        onSuccess: onClose,
        onError: (error) => {
          const latest = ackRequiredCheck(error);
          if (latest) {
            setServerCheck(latest);
            setAcknowledged(false);
          }
        },
      },
    );
  }

  return (
    <ModalFame isOpen onClose={onClose} title="Check in vehicle">
      <div className="grid gap-5">
        <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
            <User className="size-5" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-slate-900">
              {appointment.customer ? `${appointment.customer.firstName} ${appointment.customer.lastName}` : "Customer"}
            </p>
            <p className="text-slate-700">
              {[vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ")}
              {vehicle?.vin && <span className="font-mono text-xs"> · {vehicle.vin}</span>}
              {vehicle?.registrationNumber && <span className="font-mono text-xs"> · {vehicle.registrationNumber}</span>}
            </p>
            <p className="text-slate-500">
              Scheduled {fmtDateTime(appointment.scheduledAt)}
              {appointment.branch?.name && ` · ${appointment.branch.name}`}
            </p>
          </div>
        </div>

        <Field label="Current mileage (km)">
          <input
            autoFocus
            className={cn(inputCls, "h-12 text-base", tooLow && "border-red-400")}
            inputMode="numeric"
            placeholder="e.g. 103250"
            value={mileage}
            onChange={(e) => setMileage(e.target.value.replace(/[^\d,]/g, ""))}
          />
          <span className={cn("text-xs", tooLow ? "text-red-600" : "text-slate-500")}>
            {lastRecorded != null ? `Last recorded ${fmtKm(lastRecorded)}` : "No previous reading recorded"}
            {tooLow && " — the new reading cannot be lower. Use the job card if the odometer was replaced."}
          </span>
        </Field>

        {canSeeWarranty && (
          <WarrantyCheckPanel
            variant="checkin"
            check={check}
            isFetching={warranty.isFetching}
            isError={warranty.isError}
            acknowledged={acknowledged}
            onAcknowledgedChange={setAcknowledged}
            acknowledgedBy={user ? `${user.firstName} ${user.lastName}` : undefined}
            emptyText="Enter the current mileage to check warranty and open campaigns."
          />
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={update.isPending || parsed === undefined || tooLow || (canSeeWarranty && (needsAck || warranty.isFetching))}>
            {update.isPending ? "Checking in…" : "Confirm check-in"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
