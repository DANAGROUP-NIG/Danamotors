"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api/apiClient";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { Button } from "@/components/ui/button";
import type { Customer } from "../types/customer.types";

export function CustomerMergeCard(
  {
    customer,
  }: {
    customer: Customer;
  },
) {
  const {
    isAdminOrAbove,
  } = useAuth();

  const router = useRouter();
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const merge = useMutation({
    mutationFn: () => apiPost(`/customers/${customer.id}/merge`, {
      targetId,
    }),

    onSuccess: () => {
      queryClient.invalidateQueries();
      router.push(`/customers/${targetId}`);
    },
  });

  return (
    <section className="grid gap-3 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">Customer registration</h2>
      <p>{customer.code}· {customer.type}· {customer.salutation} {customer.companyName}</p>
      <p>Registered name: {customer.registeredName || "Same as customer"}</p>
      <p>{[customer.house, customer.street, customer.city, customer.state, customer.zone].filter(Boolean).join(", ")}</p>
      <p>Additional phones: {[customer.mobile2, customer.office1, customer.office2].filter(Boolean).join(", ") || "None"}</p>
      <p>Tally party code: {customer.tallyPartyCode || "Not assigned"}</p>
      {isAdminOrAbove && <><h3 className="font-medium">Merge this duplicate into another customer</h3><p className="text-sm text-slate-500">Vehicles, jobs, invoices and credit move to the selected customer. This record is retained for audit and its portal login is disabled.</p><WorkshopPicker
          label="Customer to keep"
          endpoint="/customers"
          collection="customers"
          value={targetId}
          onChange={id => {
            setTargetId(id);
            setConfirmed(false);
          }} /><label className="text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I have reviewed both records and want to merge this customer.</label><Button
          variant="outline"
          disabled={!confirmed || !targetId || targetId === customer.id || merge.isPending}
          onClick={() => merge.mutate()}>Merge into selected customer</Button>{merge.isError && <p role="alert" className="text-red-600">Merge failed. Check for different Tally accounts or records already merged.</p>}</>}
    </section>
  );
}
