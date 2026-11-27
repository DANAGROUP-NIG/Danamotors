"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { Field, inputCls } from "@/components/forms/FormField";
import { NumberInput } from "@/components/forms/NumberInput";
import ModalFame from "@/components/modals/ModalFame";
import { useParts } from "@/features/inventory/hooks/use-parts";
import { lagosDate } from "@/features/service-transactions/transaction.logic";
import { WorkshopPicker } from "./WorkshopPicker";
import type {
  InspectionPart,
  JobCardWorkflow,
  WorkflowAction,
  useJobCardWorkflow,
} from "../hooks/use-job-card-workflow";

const stages = [
  [
    "OPENED",
    "Opened",
    "Service Adviser or Workshop Manager to assign a Technician",
  ],
  [
    "TECHNICIAN_ASSIGNED",
    "Technician assigned",
    "Assigned Technician to submit the inspection",
  ],
  [
    "AWAITING_WARRANTY",
    "Awaiting warranty",
    "Warranty Officer to review the inspection",
  ],
  [
    "WARRANTY_RESOLVED",
    "Warranty resolved",
    "Service Adviser to prepare the estimate",
  ],
  ["ESTIMATE_PREPARED", "Estimate prepared", "Customer to sign the estimate"],
  [
    "ESTIMATE_APPROVED",
    "Estimate approved",
    "Workshop Manager to request parts",
  ],
  ["PARTS_REQUESTED", "Parts requested", "Store Manager to issue parts"],
  ["PARTS_ISSUED", "Parts issued", "Assigned Technician to start work"],
  ["IN_PROGRESS", "Work in progress", "Assigned Technician to complete work"],
  ["AWAITING_QC", "Awaiting quality check", "QC Officer to record the result"],
  [
    "QC_PASSED",
    "Quality check passed",
    "Service Adviser to mark the job ready for billing",
  ],
  [
    "READY_FOR_BILLING",
    "Ready for billing",
    "Billing Officer to create the job bill",
  ],
  ["BILLED", "Billed", "Billing complete"],
] as const;

const extraStages: Record<string, string> = {
  OPEN: "Opened",
  QC: "Awaiting quality check",
  READY: "Ready for billing",
  REWORK: "Rework required",
  CANCELLED: "Cancelled",
  DELIVERED: "Delivered",
};

export function workflowStageLabel(value: string) {
  return (
    stages.find(([stage]) => stage === value)?.[1] ??
    extraStages[value] ??
    "Status recorded"
  );
}

const simpleActions = [
  ["startWork", "Start work"],
  ["finishWork", "Mark work complete"],
  ["readyForBilling", "Mark ready for billing"],
] as const;

type WorkflowHook = ReturnType<typeof useJobCardWorkflow>;
type WorkflowQuery = Pick<WorkflowHook, "data" | "isPending" | "isError"> & {
  refetch: () => unknown;
  mutation: Pick<WorkflowHook["mutation"], "isPending" | "mutate">;
};

export function JobCardWorkflowPanel({
  query,
  jobCardId,
  customerId,
  ignoreOpeningApproval = false,
}: {
  query: WorkflowQuery;
  jobCardId: string;
  customerId?: string | null;
  ignoreOpeningApproval?: boolean;
}) {
  const workflow = query.data;
  const { mutation } = query;
  const [qcRemarks, setQcRemarks] = useState("");
  const [qcError, setQcError] = useState("");
  const [confirmBypass, setConfirmBypass] = useState(false);
  if (query.isPending)
    return <LoadingSkeleton variant="workspace" label="Loading job workflow" />;
  if (query.isError)
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 print:hidden"
      >
        <p>
          Could not load the workflow. Reload it before taking a job action.
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Reload workflow
        </Button>
      </div>
    );
  if (!workflow) return null;
  const allowed = (action: WorkflowAction) => {
    const entry = workflow.actions[action];
    // Temporarily ignore only the opening-approval gate reported by the API.
    return entry?.allowed === true ||
      (ignoreOpeningApproval && entry?.code === "JOB_OPENING_SIGNATURE_REQUIRED");
  };
  const visible = (action: WorkflowAction) => {
    const entry = workflow.actions[action];
    return Boolean(
      entry &&
      ![
        "WORKFLOW_ROLE_REQUIRED",
        "WORKFLOW_STAGE_CONFLICT",
        "ASSIGNED_TECHNICIAN_REQUIRED",
        "WARRANTY_BYPASS_DISABLED",
      ].includes(entry.code ?? ""),
    );
  };
  const stage = workflow.stage === "REWORK" ? "IN_PROGRESS" : workflow.stage;
  const current = stages.findIndex(([value]) => value === stage);
  const assignment =
    allowed("assignTechnician") || allowed("reassignTechnician");
  const qc = visible("passQc") || visible("failQc");
  const review = (action: "passQc" | "failQc") => {
    const remarks = qcRemarks.trim();
    if (!remarks)
      return setQcError("Enter QC remarks before recording the result.");
    mutation.mutate(
      { action, remarks },
      {
        onSuccess: () => {
          setQcRemarks("");
          setQcError("");
        },
      },
    );
  };

  return (
    <section
      aria-label="Job workflow"
      className="space-y-4 rounded-xl border border-border bg-card p-4 print:hidden sm:p-5"
    >
      <header className="space-y-1">
        <h2 className="text-base font-semibold">Job workflow</h2>
        <p className="text-sm text-muted-foreground">
          Current stage: {workflowStageLabel(workflow.stage)}
        </p>
      </header>
      <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
        <div>
          <h3 className="font-semibold">Next action</h3>
          <p className="text-sm text-muted-foreground">
            {workflow.stage === "REWORK"
              ? "Assigned Technician to complete rework"
              : (stages[current]?.[2] ?? "No workflow action is pending")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {assignment && (
            <Button asChild>
              <Link href={`/job-cards/${jobCardId}?tab=labour`} replace scroll={false}>Review Technician assignment</Link>
            </Button>
          )}
          {allowed("submitInspection") && (
            <Button asChild>
              <a href="#workflow-inspection">Record inspection</a>
            </Button>
          )}
          {allowed("bypassWarranty") && (
            <Button variant="outline" className="h-auto min-h-10 max-w-full whitespace-normal py-2 text-center" onClick={() => setConfirmBypass(true)}>
              Proceed without warranty response
            </Button>
          )}
          {allowed("prepareEstimate") && (
            <Button asChild>
              <a href="#estimate-approval">Review estimate</a>
            </Button>
          )}
          {visible("requestParts") && (
            <div className="space-y-1">
              <Button
                disabled={mutation.isPending || !allowed("requestParts")}
                onClick={() =>
                  mutation.mutate({
                    action: "requestParts",
                    requestId: crypto.randomUUID(),
                  })
                }
              >
                {workflow.noPartsRequired
                  ? "Confirm no parts required"
                  : "Request parts"}
              </Button>
              {!allowed("requestParts") && (
                <p className="text-sm text-muted-foreground">
                  {workflow.actions.requestParts?.reason}
                </p>
              )}
            </div>
          )}
          {allowed("issueParts") && (
            <Button asChild>
              <Link href={`/job-cards/${jobCardId}?tab=parts`} replace scroll={false}>Review part requisition</Link>
            </Button>
          )}
          {qc && (
            <Button asChild>
              <a href="#workflow-qc">Review quality check</a>
            </Button>
          )}
          {allowed("bill") && customerId && (
            <Button asChild>
              <Link
                id="workflow-billing"
                href={`/invoices/new?jobCardId=${jobCardId}&customerId=${customerId}`}
              >
                Create job bill
              </Link>
            </Button>
          )}
          {simpleActions
            .filter(([action]) => visible(action))
            .map(([action, label]) => (
              <div key={action} className="space-y-1">
                <Button
                  disabled={mutation.isPending || !allowed(action)}
                  onClick={() => mutation.mutate({ action })}
                >
                  {label}
                </Button>
                {!allowed(action) && (
                  <p className="text-sm text-muted-foreground">
                    {workflow.actions[action]?.reason}
                  </p>
                )}
              </div>
            ))}
        </div>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {stages.map(([value, label], index) => {
          const entry = workflow.history.find(
            (item) => item.toStatus === value,
          );
          const active = index === current;
          return (
            <li
              key={value}
              aria-current={active ? "step" : undefined}
              className="min-w-0 rounded-md border border-border px-3 py-2 text-sm"
            >
              <p
                className={
                  active ? "font-semibold text-primary" : "font-medium"
                }
              >
                {label}
              </p>
              <p className="text-xs text-muted-foreground">
                {entry
                  ? [entry.actorName, lagosDate(entry.createdAt)]
                      .filter(Boolean)
                      .join(", ")
                  : active
                    ? "Current stage"
                    : index < current
                      ? "Complete"
                      : "Pending"}
              </p>
            </li>
          );
        })}
      </ol>
      <details className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer font-medium">
          Fault verification
        </summary>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">
          {workflow.faultVerification}
        </p>
      </details>
      <div id="workflow-inspection" className="scroll-mt-28">
        {allowed("submitInspection") && <InspectionForm query={query} />}
      </div>
      {workflow.inspectionSubmittedAt && (
        <div
          id="workflow-warranty"
          className="scroll-mt-28 space-y-2 rounded-lg border border-border p-3"
        >
          <h3 className="font-semibold">Inspection and parts</h3>
          <p className="whitespace-pre-wrap break-words text-sm">
            {workflow.inspectionRemarks}
          </p>
          {workflow.noPartsRequired ? (
            <p className="text-sm text-muted-foreground">No parts required</p>
          ) : (
            <ul className="divide-y divide-border">
              {workflow.parts.map((part) => (
                <li
                  key={part.sparePartId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="min-w-0 break-words">
                    {part.partNumber}, {part.name}
                  </span>
                  <span className="text-muted-foreground">
                    Quantity {part.quantity},{" "}
                    {workflow.warrantySource
                      ? part.isUnderWarranty
                        ? "Warranty"
                        : "Not under warranty"
                      : "Awaiting warranty"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {workflow.warrantySource === "bypass" && (
            <p className="text-sm text-muted-foreground">
              Proceeded without a warranty response.
            </p>
          )}
        </div>
      )}
      {qc && (
        <div
          id="workflow-qc"
          className="scroll-mt-28 space-y-3 rounded-lg border border-border p-3"
        >
          <h3 className="font-semibold">Quality check</h3>
          <Field label="QC remarks" required error={qcError}>
            <textarea
              className={`${inputCls} min-h-24 resize-y py-2`}
              rows={3}
              maxLength={5000}
              required
              aria-invalid={Boolean(qcError)}
              value={qcRemarks}
              disabled={mutation.isPending}
              onChange={(event) => {
                setQcRemarks(event.target.value);
                setQcError("");
              }}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={mutation.isPending || !allowed("passQc")}
              onClick={() => review("passQc")}
            >
              Record QC pass
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending || !allowed("failQc")}
              onClick={() => review("failQc")}
            >
              Record QC failure
            </Button>
          </div>
          {!allowed("passQc") && workflow.actions.passQc?.reason && (
            <p className="text-sm text-muted-foreground">
              {workflow.actions.passQc.reason}
            </p>
          )}
        </div>
      )}
      <Link className="inline-flex rounded-md text-sm font-medium text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={`/job-cards/${jobCardId}?tab=history`} replace scroll={false}>
        View workflow history
      </Link>
      <ModalFame
        isOpen={confirmBypass}
        onClose={() => {
          if (!mutation.isPending) setConfirmBypass(false);
        }}
        title="Proceed without warranty response"
        preventAccidentalClose
      >
        <p className="text-sm text-muted-foreground">
          This temporary action treats all submitted parts as outside warranty
          so the Service Adviser can prepare the estimate.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => setConfirmBypass(false)}
          >
            Cancel
          </Button>
          <Button
            className="h-auto min-h-10 max-w-full whitespace-normal py-2 text-center"
            disabled={mutation.isPending || !allowed("bypassWarranty")}
            onClick={() =>
              mutation.mutate(
                { action: "bypassWarranty" },
                { onSuccess: () => setConfirmBypass(false) },
              )
            }
          >
            Proceed without warranty response
          </Button>
        </div>
      </ModalFame>
    </section>
  );
}

export function JobCardWorkflowHistory({ history }: { history: JobCardWorkflow["history"] }) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">Workflow history</h3>
      {history.length ? (
        <ol className="divide-y divide-border">
          {history.map(entry => (
            <li key={entry.id} className="space-y-1 py-2 text-sm">
              <p className="font-medium">{workflowStageLabel(entry.toStatus)}</p>
              <p className="text-muted-foreground">{[entry.actorName, lagosDate(entry.createdAt)].filter(Boolean).join(", ")}</p>
              {entry.remarks && <p className="whitespace-pre-wrap break-words">{entry.remarks}</p>}
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-muted-foreground">No workflow activity has been recorded.</p>}
    </section>
  );
}

export function JobCardTechnicianAssignment({ query, branchId }: { query: WorkflowQuery; branchId: string }) {
  const [technicianId, setTechnicianId] = useState("");
  const { data: workflow, mutation } = query;
  const allowed = workflow?.actions.assignTechnician?.allowed || workflow?.actions.reassignTechnician?.allowed;
  if (!allowed) return null;
  return (
    <div className="grid items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
      <WorkshopPicker
        label="Technician"
        endpoint={`/workshop/technicians?branchId=${branchId}&activeOnly=true`}
        collection="technicians"
        value={technicianId}
        disabled={mutation.isPending}
        onChange={setTechnicianId}
      />
      <Button className="justify-self-start" disabled={!technicianId || mutation.isPending}
        onClick={() => mutation.mutate({ action: "assignTechnician", technicianId }, { onSuccess: () => setTechnicianId("") })}>
        {mutation.isPending ? "Saving Technician assignment" : "Save Technician assignment"}
      </Button>
    </div>
  );
}

function InspectionForm({ query }: { query: WorkflowQuery }) {
  const { mutation } = query;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [parts, setParts] = useState<InspectionPart[]>([]);
  const [remarks, setRemarks] = useState("");
  const [noPartsRequired, setNoPartsRequired] = useState(false);
  const [errors, setErrors] = useState<{ parts?: string; remarks?: string }>(
    {},
  );
  const [confirm, setConfirm] = useState(false);
  const catalogue = useParts({
    search: search.trim(),
    partStatus: "ACTIVE",
    limit: 20,
  });
  const options = (catalogue.data?.items ?? []).filter(
    (item) => !parts.some((part) => part.sparePartId === item.id),
  );
  const selectedPart = options.find((item) => item.id === selected);
  const addPart = () => {
    if (!selectedPart) return;
    const { id, partNumber, name } = selectedPart;
    setParts((current) => [
      ...current,
      { sparePartId: id, partNumber, name, quantity: 1 },
    ]);
    setSelected("");
    setErrors((current) => ({ ...current, parts: undefined }));
  };
  const review = () => {
    const invalid = {
      parts:
        !noPartsRequired &&
        (!parts.length ||
          parts.some(
            (part) =>
              !Number.isInteger(part.quantity) ||
              part.quantity < 1 ||
              part.quantity > 9999,
          ))
          ? "Add at least one part with a quantity from 1 to 9999, or select No parts required."
          : undefined,
      remarks: remarks.trim() ? undefined : "Enter your inspection remarks.",
    };
    setErrors(invalid);
    if (!invalid.parts && !invalid.remarks) setConfirm(true);
  };
  const submit = () =>
    mutation.mutate(
      {
        action: "submitInspection",
        remarks: remarks.trim(),
        noPartsRequired,
        parts: noPartsRequired
          ? []
          : parts.map(({ sparePartId, quantity }) => ({
              sparePartId,
              quantity,
            })),
      },
      { onSuccess: () => setConfirm(false) },
    );
  return (
    <form
      className="space-y-3 rounded-lg border border-border p-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        review();
      }}
    >
      <h3 className="font-semibold">Technician inspection</h3>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={noPartsRequired}
          disabled={mutation.isPending}
          onChange={(event) => {
            setNoPartsRequired(event.target.checked);
            setErrors((current) => ({ ...current, parts: undefined }));
          }}
        />
        No parts required
      </label>
      {!noPartsRequired && (
        <>
          <div className="grid items-end gap-2 sm:grid-cols-2">
            <Field label="Search parts catalogue">
              <input
                className={inputCls}
                type="search"
                value={search}
                disabled={mutation.isPending}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSelected("");
                }}
              />
            </Field>
            <Field label="Catalogue part" error={errors.parts}>
              <select
                className={inputCls}
                value={selected}
                disabled={
                  mutation.isPending || catalogue.isPending || catalogue.isError
                }
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">Select a part</option>
                {options.map((part) => (
                  <option key={part.id} value={part.id}>
                    {part.partNumber}, {part.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {catalogue.isPending && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading catalogue parts
            </p>
          )}
          {catalogue.isError && (
            <div className="flex flex-wrap items-center gap-2" role="alert">
              <p className="text-sm">Could not load catalogue parts.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void catalogue.refetch()}
              >
                Reload parts
              </Button>
            </div>
          )}
          {!catalogue.isPending && !catalogue.isError && !options.length && (
            <p className="text-sm text-muted-foreground">
              No matching parts available. Try another part number or name.
            </p>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              !selectedPart || mutation.isPending || parts.length >= 250
            }
            onClick={addPart}
          >
            Add part
          </Button>
          <ul className="divide-y divide-border">
            {parts.map((part, index) => (
              <li
                key={part.sparePartId}
                className="grid items-end gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
              >
                <p className="min-w-0 break-words text-sm">
                  {part.partNumber}, {part.name}
                </p>
                <Field label="Quantity" required error={errors.parts && (!Number.isInteger(part.quantity) || part.quantity < 1 || part.quantity > 9999) ? "Enter a whole quantity from 1 to 9999." : undefined}>
                  <NumberInput
                    className={inputCls}
                    min={1}
                    max={9999}
                    step={1}
                    required
                    value={part.quantity || null}
                    disabled={mutation.isPending}
                    onValueChange={(quantity) => {
                      setParts((current) =>
                        current.map((item, position) =>
                          position === index ? { ...item, quantity: quantity ?? 0 } : item,
                        ),
                      );
                    }}
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  disabled={mutation.isPending}
                  aria-label={`Remove ${part.name}`}
                  onClick={() =>
                    setParts((current) =>
                      current.filter(
                        (item) => item.sparePartId !== part.sparePartId,
                      ),
                    )
                  }
                >
                  Remove part
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Field label="Inspection remarks" required error={errors.remarks}>
        <textarea
          className={`${inputCls} min-h-24 resize-y py-2`}
          rows={3}
          maxLength={5000}
          required
          aria-invalid={Boolean(errors.remarks)}
          value={remarks}
          disabled={mutation.isPending}
          onChange={(event) => {
            setRemarks(event.target.value);
            setErrors((current) => ({ ...current, remarks: undefined }));
          }}
        />
      </Field>
      <Button type="submit" disabled={mutation.isPending}>
        Review inspection
      </Button>
      <ModalFame
        isOpen={confirm}
        onClose={() => {
          if (!mutation.isPending) setConfirm(false);
        }}
        title="Submit Technician inspection"
        preventAccidentalClose
      >
        <p className="text-sm text-muted-foreground">
          The Warranty Officer will receive this inspection. Submitted remarks
          and parts become read-only.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => setConfirm(false)}
          >
            Return to inspection
          </Button>
          <Button type="button" disabled={mutation.isPending} onClick={submit}>
            {mutation.isPending ? "Submitting inspection" : "Submit inspection"}
          </Button>
        </div>
      </ModalFame>
    </form>
  );
}
