"use client";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, RefreshCw, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { cn } from "@/lib/utils";
import { useAllocationTechnicians, useDiagnosisBays } from "../../hooks/use-job-diagnosis";
import {
  ALLOCATION_NOTE_MAX,
  allocationSchema,
  availabilityBadge,
  bayLabel,
  fullName,
  jobsInHandText,
  loadPercent,
  sortTechnicians,
  teamTag,
  type AllocationValues,
} from "../../lib/diagnosis.logic";
import type { JobDiagnosis } from "../../types/job-diagnosis.types";
import { StageCard } from "../workspace/StageCard";
import { CustomerRequests } from "./DiagnosisParts";

/**
 * The workshop supervisor assigns a technician and a bay. Left: what the customer asked for and the
 * advisor's instructions. Right: the branch's active technicians with their load, the bay and a note.
 * The action bar's main button submits this form.
 */
export function AllocationStep({
  diagnosis,
  branchId,
  formId,
  onSubmit,
  onChosen,
  disabled,
}: {
  diagnosis: JobDiagnosis;
  branchId: string;
  formId: string;
  onSubmit: (values: AllocationValues, technicianName: string) => void;
  /** The chosen technician's name, for the button "Assign and send to ...". */
  onChosen: (name: string | null) => void;
  disabled: boolean;
}) {
  const technicians = useAllocationTechnicians(branchId);
  const bays = useDiagnosisBays(diagnosis.jobCardId);
  const form = useForm<AllocationValues>({
    resolver: zodResolver(allocationSchema),
    defaultValues: { technicianId: diagnosis.technician?.id ?? "", bayId: diagnosis.bay?.id ?? "", note: diagnosis.allocation?.note ?? "" },
  });
  const legendId = useId();
  const techError = form.formState.errors.technicianId?.message;
  const rows = sortTechnicians(technicians.data?.technicians ?? []);
  const nameOf = (id: string) => {
    const row = rows.find((technician) => technician.id === id);
    return row ? fullName(row) : null;
  };
  const chosen = form.watch("technicianId");

  return (
    <form
      id={formId}
      noValidate
      className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
      onSubmit={form.handleSubmit((values) => onSubmit(values, nameOf(values.technicianId) ?? "the technician"))}
    >
      <div className="grid content-start gap-4">
        <CustomerRequests requests={diagnosis.requests} />
        <StageCard title="Instructions to the technician">
          <p className="whitespace-pre-wrap break-words text-sm">{diagnosis.instructions ?? "The service advisor left no instructions."}</p>
        </StageCard>
      </div>

      <StageCard id="assign-technician" title="Assign technician">
        <fieldset disabled={disabled} className="grid gap-4">
          <div className="grid gap-2">
            <p id={legendId} className="text-sm font-semibold">
              Technician
              <span className="text-destructive" aria-hidden="true">
                {" "}
                *
              </span>
            </p>
            <p className="text-xs text-muted-foreground">Active technicians at this branch. Jobs in hand counts the jobs each one has in the workshop now.</p>
            {technicians.isLoading && (
              <div className="grid gap-2" role="status" aria-label="Loading technicians">
                {[0, 1, 2].map((key) => (
                  <div key={key} className="h-14 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            )}
            {technicians.isError && (
              <div role="alert" className="grid gap-2 rounded-lg border border-border p-3 text-sm">
                <p>The technicians could not be loaded. Check your connection and try again.</p>
                <div>
                  <Button type="button" variant="outline" onClick={() => void technicians.refetch()}>
                    <RefreshCw aria-hidden="true" />
                    Try again
                  </Button>
                </div>
              </div>
            )}
            {technicians.data && !rows.length && (
              <div className="grid justify-items-start gap-2 rounded-lg border border-dashed border-border p-4 text-sm">
                <UserX className="size-5 text-muted-foreground" aria-hidden="true" />
                <p className="font-semibold">No active technicians at this branch</p>
                <p className="text-muted-foreground">Ask an administrator to add or reactivate a technician account for this branch, then check again.</p>
                <Button type="button" variant="outline" onClick={() => void technicians.refetch()}>
                  <RefreshCw aria-hidden="true" />
                  Check again
                </Button>
              </div>
            )}
            {!!rows.length && (
              <div role="radiogroup" aria-labelledby={legendId} aria-invalid={!!techError} className="grid gap-2">
                {rows.map((row) => {
                  const badge = availabilityBadge(row.jobsInHand);
                  const tag = teamTag(row);
                  const selected = chosen === row.id;
                  return (
                    <label
                      key={row.id}
                      className={cn(
                        "flex min-h-14 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        selected ? "border-primary bg-muted/50" : "border-border hover:bg-muted/40",
                      )}
                    >
                      <input
                        type="radio"
                        className="size-5 shrink-0 accent-primary"
                        value={row.id}
                        {...form.register("technicianId", {
                          onChange: (event) => onChosen(nameOf(event.target.value)),
                        })}
                      />
                      <span className="min-w-0 flex-1 basis-32 font-semibold">{fullName(row)}</span>
                      {tag && <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs">{tag}</span>}
                      <span className="flex items-center gap-2 text-sm tabular-nums">
                        <span className="sr-only">{jobsInHandText(row.jobsInHand)}</span>
                        <span aria-hidden="true">{row.jobsInHand}</span>
                        <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <span
                            className={cn("block h-full rounded-full", row.jobsInHand >= 4 ? "bg-red-600" : row.jobsInHand >= 3 ? "bg-amber-500" : "bg-emerald-600")}
                            style={{ width: `${loadPercent(row.jobsInHand)}%` }}
                          />
                        </span>
                      </span>
                      <StatusBadge status={badge.label} tone={badge.tone} className="text-xs normal-case" />
                    </label>
                  );
                })}
              </div>
            )}
            {techError && (
              <p role="alert" className="text-sm text-destructive">
                {techError}
              </p>
            )}
          </div>

          <Field label="Bay" required error={form.formState.errors.bayId?.message}>
            <select className={cn(inputCls, "h-11")} disabled={bays.isLoading || bays.isError} {...form.register("bayId")}>
              <option value="">{bays.isLoading ? "Loading bays" : bays.isError ? "Bays could not be loaded" : "Choose a bay"}</option>
              {(bays.data?.bays ?? []).map((bay) => (
                <option key={bay.id} value={bay.id}>
                  {bayLabel(bay)}
                </option>
              ))}
            </select>
            {bays.isError ? (
              <button type="button" className="justify-self-start text-sm underline" onClick={() => void bays.refetch()}>
                Load the bays again
              </button>
            ) : bays.data && !bays.data.bays.length ? (
              <span className="text-xs text-muted-foreground">No bays are set up. Ask an administrator to add bays in Settings, Workshop masters.</span>
            ) : (
              <span className="text-xs text-muted-foreground">Required. An occupied bay is shared with the job named beside it.</span>
            )}
          </Field>

          <Field label="Note to technician (optional)" error={form.formState.errors.note?.message}>
            <textarea className={`${inputCls} h-24 py-2`} maxLength={ALLOCATION_NOTE_MAX} {...form.register("note")} />
            <span className="text-xs text-muted-foreground">For example priority or special checks. The technician sees it above the findings.</span>
          </Field>
        </fieldset>
        {disabled && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Assigning
          </p>
        )}
      </StageCard>
    </form>
  );
}
