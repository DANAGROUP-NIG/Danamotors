"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api/apiClient";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { WorkshopPicker } from "./WorkshopPicker";
import { jobCardKeys } from "../api/job-card.keys";
import type { JobCard } from "../types/job-card.types";

export function JobCardPartsSection(
  {
    jobCard,
  }: {
    jobCard: JobCard;
  },
) {
  const {
    hasPermission,
    user,
  } = useAuth();

  const queryClient = useQueryClient();
  const [part, setPart] = useState("");
  const [issuance, setIssuance] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");

  const refresh = () => queryClient.invalidateQueries({
    queryKey: jobCardKeys.all,
  });

  const issue = useMutation({
    mutationFn: () => apiPost("/inventory/issuances", {
      sparePartId: part,
      jobCardId: jobCard.id,
      branchId: jobCard.branchId,
      issuedById: user?.id,
      quantity,
    }),

    onSuccess: refresh,
  });

  const returns = useMutation({
    mutationFn: () => apiPost("/inventory/returns", {
      partIssuanceId: issuance,
      branchId: jobCard.branchId,
      returnedById: user?.id,
      quantity,
      reason,
    }),

    onSuccess: refresh,
  });

  if (jobCard.billedAt || ["DELIVERED", "CANCELLED", "Closed", "Cancelled"].includes(jobCard.status))
    return null;

  return (
    <section id="job-parts" className="grid gap-3 rounded-xl border bg-white p-5 print:hidden">
      <h2 className="font-semibold">Issue / return parts</h2>
      <Field label="Quantity"><input
          type="number"
          min="1"
          step="1"
          className={inputCls}
          value={quantity}
          onChange={e => setQuantity(Number(e.target.value))} /></Field>
      {hasPermission("partissuance:create") && !["READY", "Ready", "Completed"].includes(jobCard.status) && <><WorkshopPicker
          label="Part"
          endpoint="/inventory/spare-parts"
          collection="spareParts"
          value={part}
          onChange={setPart} /><Button type="button" disabled={!part || quantity < 1 || issue.isPending} onClick={() => issue.mutate()}>Issue parts from branch stock</Button></>}
      {hasPermission("partreturn:create") && <><Field label="Issued part"><select className={inputCls} value={issuance} onChange={e => setIssuance(e.target.value)}><option value="">Select issuance</option>{jobCard.partIssuances?.map(
              row => <option key={row.id} value={row.id}>{row.sparePart.name}— issued {row.quantity}, returned {row.returns.reduce((sum, item) => sum + (item.status.toUpperCase() === "REJECTED" ? 0 : item.quantity), 0)}</option>,
            )}</select></Field><Field label="Return reason"><input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} /></Field><Button
          type="button"
          variant="outline"
          disabled={!issuance || quantity < 1 || returns.isPending}
          onClick={() => returns.mutate()}>Return parts to stock</Button></>}
      {(issue.isError || returns.isError) && <p role="alert" className="text-sm text-red-600">Could not update parts. Check available stock and outstanding issued quantities.</p>}
    </section>
  );
}
