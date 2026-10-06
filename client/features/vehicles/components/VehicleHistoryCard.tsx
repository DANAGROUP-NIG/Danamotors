"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api/apiClient";
import { useAuth } from "@/features/auth/hooks/use-auth";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { VehicleCustomerField } from "./VehicleCustomerField";
import { customerKeys } from "@/features/customers/api/customer.keys";
import type { Vehicle } from "../types/vehicle.types";

export function VehicleHistoryCard(
  {
    vehicle,
    showServiceHistory = true,
  }: {
    vehicle: Vehicle;
    /** Off where the page shows its own service history table. */
    showServiceHistory?: boolean;
  },
) {
  const {
    hasPermission,
  } = useAuth();

  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState("");

  const change = useMutation({
    mutationFn: () => apiPost(`/vehicles/${vehicle.id}/ownerships`, {
      customerId,
      purchaseDate: new Date(date).toISOString(),
    }),

    onSuccess: () => {
      setOpen(false);
      for (const id of [vehicle.customer?.id, customerId]) {
        if (id) queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) });
      }
      setCustomerId("");
      setDate("");

      queryClient.invalidateQueries({
        queryKey: ["vehicles"],
      });
    },
  });

  return (
    <section className="mt-5 grid gap-3 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">{showServiceHistory ? "Ownership and service history" : "Ownership history"}</h2>
      <p>Current mileage: {vehicle.lastRecordedMileage ?? "Not recorded"}km · Engine: {vehicle.engineNumber || "—"}· Key: {vehicle.keyNumber || "—"}</p>
      <p>PDI: {vehicle.pdiDone ? vehicle.pdiDate?.slice(0, 10) : "Not completed"}· Sold: {vehicle.saleDate?.slice(0, 10) || "Not recorded"}· Dealer: {vehicle.sellingDealer || "—"}</p>
      {!vehicle.customer && <p>In stock — no current owner.</p>}
      {hasPermission("vehicle:ownership:create") && <Button variant="outline" onClick={() => setOpen(true)}>Change owner</Button>}
      {vehicle.ownerships?.map(
        owner => <p key={owner.id} className="text-sm">{owner.customer?.companyName || `${owner.customer?.firstName ?? ""} ${owner.customer?.lastName ?? ""}`}· {new Date(owner.purchaseDate).toLocaleDateString()}— {owner.saleDate ? new Date(owner.saleDate).toLocaleDateString() : "Current"}</p>,
      )}
      {showServiceHistory && <>
        <h3 className="font-medium">Service history</h3>
        {!vehicle.jobCards?.length && <p className="text-sm text-slate-500">No job cards recorded.</p>}
        {vehicle.jobCards?.map(
          job => <div key={job.id} className="border-t py-2 text-sm"><Link className="text-primary underline" href={`/job-cards/${job.id}`}>{job.jobNumber}</Link>· {new Date(job.createdAt).toLocaleDateString()}· {job.mileage ?? "—"}km · {job.status}<p>{job.description}</p><p>{job.workDone}</p></div>,
        )}
      </>}
      <ModalFame isOpen={open} onClose={() => setOpen(false)} title="Change vehicle owner"><form
          className="grid gap-4 p-5"
          onSubmit={e => {
            e.preventDefault();
            if (date && customerId && customerId !== vehicle.customer?.id && !change.isPending) change.mutate();
          }}><VehicleCustomerField
            value={customerId}
            onChange={setCustomerId}
            disabled={change.isPending}
            error={customerId && customerId === vehicle.customer?.id ? "This customer already owns the vehicle" : undefined}
          /><Field label="Effective date and time"><input
              required
              type="datetime-local"
              className={inputCls}
              value={date}
              onChange={e => setDate(e.target.value)} /></Field>{change.isError && <p role="alert" className="text-red-600">Owner change failed. Use a date after the latest ownership, no later than today.</p>}<Button disabled={!date || !customerId || customerId === vehicle.customer?.id || change.isPending}>Save owner change</Button></form></ModalFame>
    </section>
  );
}
