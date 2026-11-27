"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { NOT_PROVIDED } from "@/lib/format";
import { useWorkshopActions } from "../../hooks/use-workshop-actions";
import { hasJobBill } from "../../types/job-card-status";
import type { JobCard } from "../../types/job-card.types";
import {
  workDoneSchema,
  type WorkDoneValues,
} from "../../schemas/workshop-actions.schema";
import { WorkshopPicker } from "../WorkshopPicker";
import { DetailList, StageCard } from "./StageCard";

const fullName = (value: { firstName: string; lastName: string } | null | undefined) =>
  value ? `${value.firstName} ${value.lastName}`.trim() : NOT_PROVIDED;

function ErrorText({ error, fallback }: { error: unknown; fallback: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {apiErrorMessage(error, fallback)}
    </p>
  );
}

/** Repair: who works on the job. The supervisor can reassign; everyone else sees the name. Diagnosis has its own allocation. */
export function AssignTechnicianSection({ job }: { job: JobCard }) {
  const { hasPermission } = useAuth();
  const { assign } = useWorkshopActions(job.id, job.jobNumber);
  const [technicianId, setTechnicianId] = useState(job.technicianId ?? "");
  const canAssign = hasPermission("assignment:create") && !hasJobBill(job);
  return (
    <StageCard
      id="assign-technician"
      title="Technician"
      description={canAssign ? "Choose an active technician from this branch. They are told straight away." : undefined}
    >
      <DetailList rows={[{ label: "Assigned technician", value: job.technician ? fullName(job.technician) : "Not assigned" }]} />
      {canAssign && (
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (technicianId && !assign.isPending)
              assign.mutate({ technicianId }, { onSuccess: () => toast.success(`Technician assigned to job ${job.jobNumber}`) });
          }}
        >
          <WorkshopPicker
            label="Technician to assign"
            endpoint={`/workshop/technicians?branchId=${job.branchId}&activeOnly=true`}
            collection="technicians"
            value={technicianId}
            onChange={setTechnicianId}
            disabled={assign.isPending}
          />
          <Button type="submit" disabled={!technicianId || technicianId === job.technicianId || assign.isPending}>
            {assign.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {assign.isPending ? "Assigning technician" : "Assign technician"}
          </Button>
        </form>
      )}
      <ErrorText error={assign.error} fallback="Could not assign the technician. Try again." />
    </StageCard>
  );
}

/** Work done, engineer and service charge, saved without moving the job. Findings are recorded in Diagnosis. */
export function WorkDoneSection({ job }: { job: JobCard }) {
  const { hasPermission } = useAuth();
  const { saveWorkDone } = useWorkshopActions(job.id, job.jobNumber);
  const canEdit = hasPermission("jobcard:update") && !hasJobBill(job);
  const form = useForm<WorkDoneValues>({
    resolver: zodResolver(workDoneSchema),
    defaultValues: {
      serviceCharge: String(job.serviceCharge ?? 0),
      engineerId: job.engineerId ?? "",
      workDone: job.workDone ?? "",
    },
  });
  if (!canEdit)
    return (
      <StageCard title="Work done">
        <DetailList rows={[{ label: "Work done and recommendations", value: job.workDone?.trim() || NOT_PROVIDED }]} />
      </StageCard>
    );
  const { errors } = form.formState;
  const submit = form.handleSubmit((values) => {
    if (saveWorkDone.isPending) return;
    saveWorkDone.mutate({
      ...(Number(values.serviceCharge) !== (job.serviceCharge ?? 0) ? { serviceCharge: Number(values.serviceCharge) } : {}),
      ...(values.engineerId !== (job.engineerId ?? "") ? { engineerId: values.engineerId || null } : {}),
      workDone: values.workDone,
    });
  });
  return (
    <StageCard title="Work done" description="Saving keeps the job on this step.">
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <fieldset disabled={saveWorkDone.isPending} className="grid gap-4 sm:grid-cols-2">
          <Field label="Service charge (NGN)" required error={errors.serviceCharge?.message}>
            <input className={inputCls} inputMode="decimal" {...form.register("serviceCharge")} />
            <span className="text-xs text-muted-foreground">Saved as a separate bill line. Enter 0 for no service charge.</span>
          </Field>
          <WorkshopPicker
            label="Engineer (optional)"
            endpoint={`/service/staff?role=Engineer&branchId=${job.branchId}`}
            collection="users"
            value={form.watch("engineerId")}
            onChange={(value) => form.setValue("engineerId", value, { shouldDirty: true })}
          />
          <Field label="Work done and recommendations" error={errors.workDone?.message}>
            <textarea className={`${inputCls} h-28 py-2`} maxLength={10000} {...form.register("workDone")} />
          </Field>
        </fieldset>
        <ErrorText error={saveWorkDone.error} fallback="Could not save the work done. Your text is kept; try again." />
        <div>
          <Button type="submit" variant="outline" disabled={saveWorkDone.isPending}>
            {saveWorkDone.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {saveWorkDone.isPending ? "Saving work done" : "Save work done"}
          </Button>
        </div>
      </form>
    </StageCard>
  );
}
