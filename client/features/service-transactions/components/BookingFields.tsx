"use client";
import { toast } from "sonner";
import { Field, inputCls } from "@/components/forms/FormField";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import type { BookingExtra } from "@/features/appointments/types/appointment.types";
export function BookingFields({
  value,
  onChange,
  vehicleId,
  disabled = false,
  compact = false,
}: {
  value: BookingExtra;
  onChange: (value: BookingExtra) => void;
  vehicleId?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const requestField = (
    <Field label="Customer request">
      <textarea
        className={inputCls}
        maxLength={2000}
        value={value.requests ?? ""}
        onChange={(event) =>
          onChange({ ...value, requests: event.target.value })
        }
      />
    </Field>
  );
  if (compact)
    return (
      <fieldset
        disabled={disabled}
        className="space-y-3 rounded-xl border border-border p-4"
      >
        {requestField}
      </fieldset>
    );
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-4 rounded-xl border border-border p-4"
    >
      <legend className="px-2 font-semibold">
        Vehicle details and customer requests
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Booking mileage">
          <input
            aria-label="Booking mileage"
            className={inputCls}
            type="number"
            min="0"
            max="2147483647"
            step="1"
            value={value.mileage ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                mileage:
                  event.target.value === ""
                    ? undefined
                    : Number(event.target.value),
              })
            }
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.acFitted ?? false}
            onChange={(event) =>
              onChange({ ...value, acFitted: event.target.checked })
            }
          />
          Air conditioning fitted
        </label>
      </div>
      <WorkshopPicker
        label="Follow-up job (optional)"
        endpoint={`/service/job-cards?vehicleId=${vehicleId ?? ""}`}
        collection="jobCards"
        value={value.followUpJobId ?? ""}
        disabled={!vehicleId || disabled}
        onChange={(id) => {
          if (!id) onChange({ ...value, followUpJobId: null });
        }}
        onSelect={(record) => {
          if (record.vehicleId !== vehicleId) {
            toast.error("Choose a job for the selected vehicle");
            return;
          }
          onChange({ ...value, followUpJobId: record.id });
        }}
      />
      <p className="text-xs text-muted-foreground">
        Follow-up jobs must belong to this vehicle and branch.
      </p>
      {requestField}
    </fieldset>
  );
}
