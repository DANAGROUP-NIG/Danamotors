"use client";
import { useState } from "react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { canonicalJobStatus, hasJobBill } from "../types/job-card-status";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api/apiClient";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WorkshopPicker } from "./WorkshopPicker";
import { jobCardKeys } from "../api/job-card.keys";
import type { JobCard } from "../types/job-card.types";

type Line = {
  type: "COMPLAINT" | "PART" | "LABOUR" | "SERVICE";
  referenceId?: string;
  description?: string;
  quantity: number;
};

export function JobCardEstimateSection({ jobCard }: { jobCard: JobCard }) {
  const { hasPermission } = useAuth();

  const queryClient = useQueryClient();

  const [lines, setLines] = useState<Line[]>([
    ...(jobCard.complaints?.map((c) => ({
      type: "COMPLAINT" as const,
      referenceId: c.id,
      description: c.description,
      quantity: 1,
    })) ?? []),
    ...(jobCard.serviceId
      ? [
          {
            type: "SERVICE" as const,
            referenceId: jobCard.serviceId,
            description: jobCard.service?.name,
            quantity: 1,
          },
        ]
      : []),
  ]);

  const [type, setType] = useState<"PART" | "LABOUR" | "SERVICE">("PART");
  const [referenceId, setReferenceId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState("");

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: jobCardKeys.all,
    });

  const create = useMutation({
    mutationFn: () =>
      apiPost(`/service/job-cards/${jobCard.id}/estimates`, {
        description: "Workshop estimate",
        lines,
      }),

    onSuccess: async () => { toast.success("Priced estimate saved"); setLines([]); await refresh(); },
  });

  const approval = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      apiPost(`/service/estimates/${id}/approvals`, {
        customerId: jobCard.customerId,
        approved,
      }),

    onSuccess: async () => { toast.success("Customer decision recorded"); await refresh(); },
  });

  const open =
    !hasJobBill(jobCard) &&
    ![
      "READY",
      "BILLED",
      "DELIVERED",
      "CANCELLED",
      "Ready",
      "Completed",
      "Closed",
      "Cancelled",
    ].includes(canonicalJobStatus(jobCard.status));
  const actionError = create.error ?? approval.error;

  return (
    <section className="grid gap-3 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">Estimate and customer decision</h2>
      {open && hasPermission("estimate:create") && (
        <div className="grid gap-3 print:hidden" inert={create.isPending}>
          <p className="text-sm text-slate-500">
            Service catalog prices, part retail prices and model labour rates
            are applied when the estimate is saved.
          </p>
          {lines.map((line, index) => (
            <div key={index} className="flex justify-between text-sm">
              <span>
                {line.type}: {line.description}× {line.quantity}
              </span>
              <button
                type="button"
                onClick={() =>
                  setLines((current) => current.filter((_, i) => i !== index))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <Field label="Line type">
            <select
              className={inputCls}
              value={type}
              onChange={(e) => {
                setType(e.target.value as "PART" | "LABOUR" | "SERVICE");
                setReferenceId("");
              }}
            >
              <option>PART</option>
              <option>LABOUR</option>
              <option>SERVICE</option>
            </select>
          </Field>
          <WorkshopPicker
            key={type}
            label={
              type === "PART"
                ? "Part"
                : type === "LABOUR"
                  ? "Labour operation"
                  : "Service"
            }
            endpoint={
              type === "PART"
                ? "/inventory/spare-parts"
                : type === "LABOUR"
                  ? "/service/labour-items"
                  : "/services?isActive=true"
            }
            collection={
              type === "PART"
                ? "spareParts"
                : type === "LABOUR"
                  ? "labourItems"
                  : "services"
            }
            value={referenceId}
            onChange={setReferenceId}
            onSelect={(row) =>
              setDescription(row.description ?? row.name ?? "")
            }
          />
          <Field label="Quantity / hours">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              className={inputCls}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={!referenceId || !Number.isFinite(quantity) || quantity <= 0 || lines.length >= 200}
            onClick={() => {
              setLines((current) => [
                ...current,
                {
                  type,
                  referenceId,
                  description,
                  quantity,
                },
              ]);

              setReferenceId("");
            }}
          >
            Add estimate line
          </Button>
          <Button
            type="button"
            disabled={!lines.length || create.isPending}
            onClick={() => create.mutate()}
          >
            Save priced estimate
          </Button>
        </div>
      )}
      {jobCard.estimates?.map((estimate) => (
        <div key={estimate.id} className="border-t pt-2 text-sm">
          <p>
            {estimate.description}: {estimate.currency} {estimate.amount.toLocaleString()} —{" "}
            {estimate.status}
          </p>
          {!!estimate.lines?.length && <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Description</th><th>Quantity / hours</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{estimate.lines.map((line) => <tr key={line.id} className="border-b"><td className="py-2">{line.description}</td><td>{line.quantity}</td><td>{line.rate.toLocaleString()}</td><td>{line.amount.toLocaleString()}</td></tr>)}</tbody></table></div>}
          {estimate.approvals?.map((decision) => <p key={decision.id} className="mt-2 text-muted-foreground">{decision.approved ? "Approved" : "Declined"}{decision.decisionDate ? ` on ${new Date(decision.decisionDate).toLocaleString()}` : ""}{decision.comments ? ` — ${decision.comments}` : ""}</p>)}
          {open && hasPermission("estimate:approve") && !estimate.approvals?.length && (
            <div className="flex gap-2 print:hidden">
              <Button
                type="button"
                size="sm"
                disabled={approval.isPending}
                onClick={() =>
                  approval.mutate({
                    id: estimate.id,
                    approved: true,
                  })
                }
              >
                Record approval
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={approval.isPending}
                onClick={() =>
                  approval.mutate({
                    id: estimate.id,
                    approved: false,
                  })
                }
              >
                Record decline
              </Button>
            </div>
          )}
        </div>
      ))}
      {(create.isError || approval.isError) && (
        <p role="alert" className="text-sm text-red-600">
          {isAxiosError(actionError) ? actionError.response?.data?.message || "Could not save the estimate or decision." : "Could not save the estimate or decision."}
        </p>
      )}
    </section>
  );
}
