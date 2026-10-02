"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api/apiClient";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WorkshopPicker } from "./WorkshopPicker";
import { jobCardKeys } from "../api/job-card.keys";
import type { JobCard } from "../types/job-card.types";

type Line = {
  type: "COMPLAINT" | "PART" | "LABOUR";
  referenceId?: string;
  description?: string;
  quantity: number;
};

export function JobCardEstimateSection(
  {
    jobCard,
  }: {
    jobCard: JobCard;
  },
) {
  const {
    hasPermission,
  } = useAuth();

  const queryClient = useQueryClient();

  const [lines, setLines] = useState<Line[]>(jobCard.complaints?.map(c => ({
    type: "COMPLAINT",
    referenceId: c.id,
    description: c.description,
    quantity: 1,
  })) ?? []);

  const [type, setType] = useState<"PART" | "LABOUR">("PART");
  const [referenceId, setReferenceId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState("");

  const refresh = () => queryClient.invalidateQueries({
    queryKey: jobCardKeys.all,
  });

  const create = useMutation({
    mutationFn: () => apiPost(`/service/job-cards/${jobCard.id}/estimates`, {
      description: "Workshop estimate",
      lines,
    }),

    onSuccess: refresh,
  });

  const approval = useMutation({
    mutationFn: (
      {
        id,
        approved,
      }: {
        id: string;
        approved: boolean;
      },
    ) => apiPost(`/service/estimates/${id}/approvals`, {
      customerId: jobCard.customerId,
      approved,
    }),

    onSuccess: refresh,
  });

  const open = !jobCard.billedAt && !["READY", "BILLED", "DELIVERED", "CANCELLED", "Ready", "Completed", "Closed", "Cancelled"].includes(jobCard.status);

  return (
    <section className="grid gap-3 rounded-xl border bg-white p-5 print:hidden">
      <h2 className="font-semibold">Estimate and customer decision</h2>
      {open && hasPermission("estimate:create") && <>
        <p className="text-sm text-slate-500">Part retail prices and model labour rates are applied when the estimate is saved.</p>
        {lines.map(
          (line, index) => <div key={index} className="flex justify-between text-sm"><span>{line.type}: {line.description}× {line.quantity}</span><button type="button" onClick={() => setLines(current => current.filter((_, i) => i !== index))}>Remove</button></div>,
        )}
        <Field label="Line type"><select
            className={inputCls}
            value={type}
            onChange={e => {
              setType(e.target.value as "PART" | "LABOUR");
              setReferenceId("");
            }}><option>PART</option><option>LABOUR</option></select></Field>
        <WorkshopPicker
          key={type}
          label={type === "PART" ? "Part" : "Labour operation"}
          endpoint={type === "PART" ? "/inventory/spare-parts" : "/service/labour-items"}
          collection={type === "PART" ? "spareParts" : "labourItems"}
          value={referenceId}
          onChange={setReferenceId}
          onSelect={row => setDescription(row.description ?? row.name ?? "")} />
        <Field label="Quantity / hours"><input
            type="number"
            min="0.01"
            step="0.01"
            value={quantity}
            className={inputCls}
            onChange={e => setQuantity(Number(e.target.value))} /></Field>
        <Button
          type="button"
          variant="outline"
          disabled={!referenceId || quantity <= 0}
          onClick={() => {
            setLines(current => [...current, {
              type,
              referenceId,
              description,
              quantity,
            }]);

            setReferenceId("");
          }}>Add estimate line</Button>
        <Button type="button" disabled={!lines.length || create.isPending} onClick={() => create.mutate()}>Save priced estimate</Button>
      </>}
      {jobCard.estimates?.map(
        estimate => <div key={estimate.id} className="border-t pt-2 text-sm"><p>{estimate.description}: NGN {estimate.amount.toLocaleString()}— {estimate.status}</p>{hasPermission("estimate:approve") && !estimate.approvals?.length && <div className="flex gap-2"><Button
              type="button"
              size="sm"
              disabled={approval.isPending}
              onClick={() => approval.mutate({
                id: estimate.id,
                approved: true,
              })}>Record approval</Button><Button
              type="button"
              size="sm"
              variant="outline"
              disabled={approval.isPending}
              onClick={() => approval.mutate({
                id: estimate.id,
                approved: false,
              })}>Record decline</Button></div>}</div>,
      )}
      {(create.isError || approval.isError) && <p role="alert" className="text-sm text-red-600">Could not save the estimate or decision. Refresh and check the selected lines.</p>}
    </section>
  );
}
