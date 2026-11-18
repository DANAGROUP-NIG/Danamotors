"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { apiPost } from "@/lib/api/apiClient";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WorkshopPicker, customerLabel, customerOption } from "@/features/job-cards/components/WorkshopPicker";
import { Button } from "@/components/ui/button";
import { useCustomer } from "../hooks/use-customer";
import type { Customer } from "../types/customer.types";

/** Field groups the user picks per merge; mirrors MERGE_FIELD_GROUPS in server customer-merge-extras.ts. */
export type MergeGroup = "name" | "phone" | "email" | "address";
export type MergeKeep = Partial<Record<MergeGroup, "TARGET" | "SOURCE">>;

export const MERGE_GROUPS: { key: MergeGroup; label: string; show: (c: Customer) => string }[] = [
  { key: "name", label: "Name", show: (c) => [c.salutation, c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ")].filter(Boolean).join(" ") },
  { key: "phone", label: "Phone", show: (c) => [c.phoneNumber, c.mobile2, c.office1, c.office2].filter(Boolean).join(", ") },
  { key: "email", label: "Email", show: (c) => c.email ?? "" },
  { key: "address", label: "Address", show: (c) => [c.house, c.street, c.address, c.zone, c.city, c.state].filter(Boolean).join(", ") },
];

export function CustomerMergeCard({ customer }: { customer: Customer }) {
  const { isAdminOrAbove } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [keep, setKeep] = useState<MergeKeep>({});
  const { data: target } = useCustomer(targetId);

  const merge = useMutation({
    mutationFn: () => apiPost(`/customers/${customer.id}/merge`, { targetId, keep }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Customers merged");
      router.push(`/customers/${targetId}`);
    },
  });

  const differing = target ? MERGE_GROUPS.filter((g) => g.show(customer) !== g.show(target) && g.show(customer)) : [];

  return (
    <section className="grid gap-3 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">Customer registration</h2>
      <p>{customer.code}· {customer.type}· {customer.salutation} {customer.companyName}</p>
      <p>Registered name: {customer.registeredName || "Same as customer"}</p>
      <p>{[customer.house, customer.street, customer.city, customer.state, customer.zone].filter(Boolean).join(", ")}</p>
      <p>Additional phones: {[customer.mobile2, customer.office1, customer.office2].filter(Boolean).join(", ") || "None"}</p>
      <p>Tally party code: {customer.tallyPartyCode || "Not assigned"}</p>
      {isAdminOrAbove && (
        <>
          <h3 className="font-medium">Merge this duplicate into another customer</h3>
          <p className="text-sm text-slate-500">
            Vehicles, jobs, invoices and credit move to the selected customer. This record is retained for audit and its portal login is disabled.
            {" "}To review many duplicates at once, use <Link href="/customers/duplicates" className="text-primary underline">Duplicate customers</Link>.
          </p>
          <WorkshopPicker
            label="Customer to keep"
            endpoint="/customers"
            collection="customers"
            formatLabel={customerLabel}
            renderOption={customerOption}
            value={targetId}
            onChange={(id) => {
              setTargetId(id);
              setKeep({});
              setConfirmed(false);
            }}
          />
          {target && target.id !== customer.id && (
            <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-medium">Details the kept customer ends up with</legend>
              {differing.length === 0 ? (
                <p className="text-sm text-slate-500">This record has no details that differ from the kept customer&apos;s.</p>
              ) : (
                differing.map((g) => (
                  <div key={g.key} className="grid gap-1 text-sm sm:grid-cols-[6rem_1fr_1fr] sm:items-start sm:gap-3">
                    <span className="font-medium text-slate-600">{g.label}</span>
                    {(["TARGET", "SOURCE"] as const).map((side) => (
                      <label key={side} className="flex items-start gap-2 rounded-md border border-slate-200 px-2 py-1.5 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                        <input
                          type="radio"
                          className="mt-1"
                          name={`keep-${g.key}`}
                          checked={(keep[g.key] ?? "TARGET") === side}
                          onChange={() => setKeep((k) => ({ ...k, [g.key]: side }))}
                        />
                        <span>
                          <span className="block text-xs text-slate-500">{side === "TARGET" ? "Kept customer's (now)" : "This record's"}</span>
                          {(side === "TARGET" ? g.show(target) : g.show(customer)) || <span className="text-slate-400">None</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                ))
              )}
            </fieldset>
          )}
          <label className="text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I have reviewed both records and want to merge this customer.
          </label>
          <Button variant="outline" disabled={!confirmed || !targetId || targetId === customer.id || merge.isPending} onClick={() => merge.mutate()}>
            Merge into selected customer
          </Button>
          {merge.isError && <p role="alert" className="text-red-600">Merge failed. Check for different Tally accounts or records already merged.</p>}
        </>
      )}
    </section>
  );
}
