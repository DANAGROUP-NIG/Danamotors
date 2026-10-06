"use client";
import { useState } from "react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api/apiClient";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { EstimatePartPicker } from "./EstimatePartPicker";
import { WorkshopPicker } from "./WorkshopPicker";
import { canonicalJobStatus, hasJobBill } from "../types/job-card-status";
import { jobCardKeys } from "../api/job-card.keys";
import type { JobCard } from "../types/job-card.types";

type Line = {
  type: "COMPLAINT" | "PART" | "LABOUR" | "SERVICE";
  referenceId?: string;
  description?: string;
  quantity: number;
  includedInService?: boolean;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(
    value,
  );
export function JobCardEstimateSection({ jobCard }: { jobCard: JobCard }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const estimates = jobCard.estimates ?? [];
  const latest = estimates[0];
  const [editing, setEditing] = useState(!latest);
  const [lines, setLines] = useState<Line[]>(
    jobCard.serviceId
      ? [
          {
            type: "SERVICE",
            referenceId: jobCard.serviceId,
            description: jobCard.service?.name,
            quantity: 1,
          },
        ]
      : [],
  );
  const [type, setType] = useState<"PART" | "LABOUR">("PART");
  const [referenceId, setReferenceId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [includedInService, setIncluded] = useState(false);
  const [comments, setComments] = useState("");
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: jobCardKeys.all });
    await queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };
  const create = useMutation({
    mutationFn: () =>
      apiPost(`/service/job-cards/${jobCard.id}/estimates`, {
        description: `Workshop estimate ? revision ${estimates.length + 1}`,
        lines,
      }),
    onSuccess: async () => {
      toast.success("Estimate submitted for customer approval");
      setEditing(false);
      await refresh();
    },
  });
  const approval = useMutation({
    mutationFn: (approved: boolean) =>
      apiPost(`/service/estimates/${latest!.id}/approvals`, {
        customerId: jobCard.customerId,
        approved,
        comments: comments.trim() || undefined,
      }),
    onSuccess: async () => {
      toast.success("Customer decision recorded");
      setComments("");
      await refresh();
    },
  });
  const open =
    !hasJobBill(jobCard) &&
    !["BILLED", "DELIVERED", "CANCELLED"].includes(
      canonicalJobStatus(jobCard.status),
    );
  const state = !latest
    ? "Draft"
    : latest.status === "Approved"
      ? "Approved"
      : latest.status === "Declined"
        ? "Revision Required"
        : "Awaiting Approval";
  const error = create.error ?? approval.error;
  const busy = create.isPending || approval.isPending;
  function revise() {
    const draft =
      latest?.lines?.map((line) => ({
        type: line.type.replace("INCLUDED_", "") as Line["type"],
        referenceId: line.referenceId ?? undefined,
        description: line.description,
        quantity: line.quantity,
        includedInService: line.type.startsWith("INCLUDED_"),
      })) ?? [];
    if (jobCard.serviceId && !draft.some((line) => line.type === "SERVICE"))
      draft.unshift({
        type: "SERVICE",
        referenceId: jobCard.serviceId,
        description: jobCard.service?.name ?? "Service",
        quantity: 1,
        includedInService: false,
      });
    setLines(draft);
    setEditing(true);
  }
  return (
    <section
      id="estimate-approval"
      className="grid gap-4 rounded-xl border bg-white p-5"
    >
      <div className="flex justify-between gap-3">
        <h2 className="font-semibold">Estimate &amp; Approval</h2>
        <span className="text-sm font-medium">{editing ? "Draft" : state}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        The latest approved revision authorizes work and sets the billing
        limits. Additional parts, hours or charges require a new
        customer-approved revision. Amounts below exclude VAT and bill
        discounts.
      </p>
      {open && hasPermission("estimate:create") && !editing && (
        <Button
          type="button"
          variant="outline"
          className="print:hidden"
          disabled={busy}
          onClick={revise}
        >
          Create revised estimate
        </Button>
      )}
      {open && editing && hasPermission("estimate:create") && (
        <div className="grid gap-3 print:hidden" inert={busy}>
          <p className="text-sm text-muted-foreground">
            The service uses the saved job-card charge. Parts use retail rates;
            labour uses model rates. Mark package inclusions explicitly to avoid
            an additional charge.
          </p>
          {lines.map((line, index) => (
            <div
              key={index}
              className="flex justify-between gap-3 border-b py-2 text-sm"
            >
              <span>
                {line.description || line.type} ? {line.quantity}
                {line.includedInService ? " ? included in service charge" : ""}
                {line.type === "SERVICE"
                  ? ` ? ${money(jobCard.serviceCharge ?? 0)}`
                  : ""}
              </span>
              {line.type !== "SERVICE" && (
                <button
                  type="button"
                  onClick={() =>
                    setLines((current) => current.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <Field label="Add work">
            <select
              className={inputCls}
              value={type}
              onChange={(event) => {
                setType(event.target.value as typeof type);
                setReferenceId("");
              }}
            >
              <option value="PART">Part</option>
              <option value="LABOUR">Labour operation</option>
            </select>
          </Field>
          {type === "PART" ? (
            <EstimatePartPicker
              key={jobCard.branchId}
              branchId={jobCard.branchId}
              value={referenceId}
              onChange={(id, name) => { setReferenceId(id); setDescription(name); }}
            />
          ) : (
            <WorkshopPicker
              label="Labour operation"
              endpoint="/service/labour-items"
              collection="labourItems"
              value={referenceId}
              onChange={setReferenceId}
              onSelect={(row) => setDescription(row.name ?? row.description ?? "")}
            />
          )}
          <Field label="Quantity / hours">
            <input
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              className={inputCls}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includedInService}
              disabled={!jobCard.serviceId}
              onChange={(event) => setIncluded(event.target.checked)}
            />
            Included in the service charge (no additional charge)
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={
              !referenceId ||
              !Number.isFinite(quantity) ||
              quantity <= 0 ||
              lines.length >= 200 ||
              lines.some(
                (line) =>
                  line.type === type && line.referenceId === referenceId,
              )
            }
            onClick={() => {
              setLines((current) => [
                ...current,
                { type, referenceId, description, quantity, includedInService },
              ]);
              setReferenceId("");
            }}
          >
            Add to estimate
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={!lines.length || busy}
              onClick={() => create.mutate()}
            >
              Submit for approval
            </Button>
            {latest && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                Discard draft
              </Button>
            )}
          </div>
        </div>
      )}
      {estimates.map((estimate, index) => (
        <div key={estimate.id} className="grid gap-2 border-t pt-3 text-sm">
          <p className="font-medium">
            {estimate.description} ? {money(estimate.amount)} ?{" "}
            {index
              ? "Previous revision"
              : estimate.status === "Pending"
                ? "Awaiting Approval"
                : estimate.status}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th>Description</th>
                  <th>Qty / hours</th>
                  <th>Rate</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {estimate.lines?.map((line) => (
                  <tr key={line.id} className="border-b">
                    <td className="py-2">
                      {line.description}
                      {line.type.startsWith("INCLUDED_")
                        ? " (included in service charge)"
                        : ""}
                    </td>
                    <td>{line.quantity}</td>
                    <td>{money(line.rate)}</td>
                    <td>{money(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {estimate.approvals?.map((decision) => (
            <p key={decision.id}>
              {decision.approved ? "Approved" : "Declined"}
              {decision.decisionDate
                ? ` on ${new Date(decision.decisionDate).toLocaleString()}`
                : ""}
              {decision.comments ? ` ? ${decision.comments}` : ""}
            </p>
          ))}
        </div>
      ))}
      {open &&
        !editing &&
        latest &&
        !latest.approvals?.length &&
        hasPermission("estimate:approve") && (
          <div className="grid gap-3 print:hidden" inert={busy}>
            <Field label="Customer decision notes">
              <textarea
                className={inputCls}
                maxLength={2000}
                placeholder="Who confirmed, how, and any agreed conditions"
                value={comments}
                onChange={(event) => setComments(event.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={busy}
                onClick={() => approval.mutate(true)}
              >
                Record customer approval
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => approval.mutate(false)}
              >
                Record decline
              </Button>
            </div>
          </div>
        )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {isAxiosError(error)
            ? error.response?.data?.message ||
              "Could not save estimate or decision"
            : "Could not save estimate or decision"}
        </p>
      )}
    </section>
  );
}
