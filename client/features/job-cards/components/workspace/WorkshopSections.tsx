"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useLateReasons } from "@/features/late-deliveries/hooks/use-late-deliveries";
import { MAX_LATE_REASONS } from "@/features/late-deliveries/lib/late-delivery.logic";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { NOT_PROVIDED } from "@/lib/format";
import { useWorkshopActions } from "../../hooks/use-workshop-actions";
import { canonicalJobStatus, hasJobBill } from "../../types/job-card-status";
import type { JobCard } from "../../types/job-card.types";
import {
  creditApprovalSchema,
  deliverySchema,
  workDoneSchema,
  type CreditApprovalValues,
  type DeliveryValues,
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

/** Delivery: hand the vehicle over and issue the gate pass. Late deliveries need reasons. */
export function DeliverySection({ job, now = new Date() }: { job: JobCard; now?: Date }) {
  const { hasPermission } = useAuth();
  const { deliver } = useWorkshopActions(job.id, job.jobNumber);
  const late = !!job.promisedAt && now > new Date(job.promisedAt);
  const reasons = useLateReasons();
  const form = useForm<DeliveryValues>({
    resolver: zodResolver(deliverySchema(late)),
    defaultValues: { deliveryAdvisorId: job.serviceAdvisorId ?? "", lateReasonIds: [], lateRemarks: "", remarks: "" },
  });
  const allowed = hasPermission("jobcard:update") && (job.allowedTransitions ?? []).includes("DELIVERED");
  if (!allowed) return null;
  const unpaid = (job.invoices ?? []).some(
    (invoice) => !["CANCELLED", "CANCELED", "VOID"].includes(invoice.status.toUpperCase()) && invoice.outstandingAmount > 0,
  );
  const blocked = !job.creditApprovedById && (!hasJobBill(job) || unpaid)
    ? "Create and settle the job bill, or get delivery on credit approved, before delivering this vehicle."
    : null;
  const selected = form.watch("lateReasonIds");
  const { errors } = form.formState;
  const submit = form.handleSubmit((values) => {
    if (deliver.isPending || blocked) return;
    deliver.mutate({
      deliveryAdvisorId: values.deliveryAdvisorId,
      lateReasonIds: values.lateReasonIds,
      ...(late && values.lateRemarks.trim() ? { lateRemarks: values.lateRemarks.trim() } : {}),
      ...(values.remarks.trim() ? { remarks: values.remarks.trim() } : {}),
    });
  });
  const activeReasons = (reasons.data ?? []).filter((reason) => reason.active);
  return (
    <StageCard title="Deliver the vehicle" description="Delivering records the time, the delivery advisor and issues the gate pass.">
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <fieldset disabled={deliver.isPending} className="grid gap-4">
          <WorkshopPicker
            required
            label="Delivery advisor"
            endpoint={`/service/staff?role=ServiceAdviser&branchId=${job.branchId}`}
            collection="users"
            value={form.watch("deliveryAdvisorId")}
            onChange={(value) => form.setValue("deliveryAdvisorId", value, { shouldValidate: form.formState.isSubmitted })}
            error={errors.deliveryAdvisorId?.message}
          />
          {late && (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold">
                Late-delivery reasons<span className="text-destructive" aria-hidden="true"> *</span>
              </legend>
              <p className="text-sm text-muted-foreground">The promised time has passed. Choose one to six reasons.</p>
              {reasons.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading reasons</p>}
              {reasons.isError && (
                <p role="alert" className="text-sm text-destructive">
                  Could not load the reasons.{" "}
                  <button type="button" className="underline" onClick={() => reasons.refetch()}>
                    Try again
                  </button>
                </p>
              )}
              {reasons.data && !activeReasons.length && (
                <p className="text-sm text-muted-foreground">No late-delivery reasons are set up. Ask an administrator to add them in Workshop masters.</p>
              )}
              <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
                {activeReasons.map((reason) => (
                  <label key={reason.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={selected.includes(reason.id)}
                      disabled={selected.length >= MAX_LATE_REASONS && !selected.includes(reason.id)}
                      onChange={(event) =>
                        form.setValue(
                          "lateReasonIds",
                          event.target.checked ? [...selected, reason.id] : selected.filter((id) => id !== reason.id),
                          { shouldValidate: form.formState.isSubmitted },
                        )
                      }
                    />
                    {reason.description}
                  </label>
                ))}
              </div>
              {errors.lateReasonIds?.message && <p className="text-sm text-destructive">{errors.lateReasonIds.message}</p>}
            </fieldset>
          )}
          {late && (
            <Field label="Delay remark (optional)" error={errors.lateRemarks?.message}>
              <textarea className={`${inputCls} h-20 py-2`} maxLength={1000} {...form.register("lateRemarks")} />
              <span className="text-xs text-muted-foreground">What held the job up. Internal only, not printed for the customer.</span>
            </Field>
          )}
          <Field label="Remarks (optional)" error={errors.remarks?.message}>
            <textarea className={`${inputCls} h-20 py-2`} maxLength={2000} {...form.register("remarks")} />
          </Field>
        </fieldset>
        <ErrorText error={deliver.error} fallback="Could not deliver the vehicle. Try again." />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={deliver.isPending || !!blocked} aria-describedby={blocked ? "delivery-blocked" : undefined}>
            {deliver.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {deliver.isPending ? "Delivering" : "Deliver and issue gate pass"}
          </Button>
          {blocked && (
            <p id="delivery-blocked" className="text-sm text-muted-foreground">
              {blocked}
            </p>
          )}
        </div>
      </form>
    </StageCard>
  );
}

/** Admins can let the vehicle go before the bill is paid, with a reason. */
export function CreditApprovalSection({ job }: { job: JobCard }) {
  const { isAdminOrAbove } = useAuth();
  const { approveCredit } = useWorkshopActions(job.id, job.jobNumber);
  const form = useForm<CreditApprovalValues>({ resolver: zodResolver(creditApprovalSchema), defaultValues: { remarks: "" } });
  const status = canonicalJobStatus(job.status);
  if (job.creditApprovedById)
    return (
      <StageCard title="Delivery on credit">
        <p className="text-sm">Delivery on credit is approved for this job.</p>
      </StageCard>
    );
  if (!isAdminOrAbove || !["READY", "BILLED"].includes(status)) return null;
  return (
    <StageCard title="Delivery on credit" description="Approve only for customers with agreed credit terms. The reason is kept in the audit trail.">
      <form
        className="grid gap-3"
        noValidate
        onSubmit={form.handleSubmit((values) => {
          if (!approveCredit.isPending) approveCredit.mutate(values.remarks);
        })}
      >
        <Field label="Reason for credit approval" required error={form.formState.errors.remarks?.message}>
          <textarea className={`${inputCls} h-20 py-2`} maxLength={2000} disabled={approveCredit.isPending} {...form.register("remarks")} />
        </Field>
        <ErrorText error={approveCredit.error} fallback="Could not approve delivery on credit. Try again." />
        <div>
          <Button type="submit" variant="outline" disabled={approveCredit.isPending}>
            {approveCredit.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {approveCredit.isPending ? "Approving" : "Approve delivery on credit"}
          </Button>
        </div>
      </form>
    </StageCard>
  );
}
