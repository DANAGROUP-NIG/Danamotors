"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { CustomerSelectWithCreate } from "@/features/customers/components/CustomerSelectWithCreate";
import { VehicleSelectWithCreate } from "@/features/vehicles/components/VehicleSelectWithCreate";
import { EstimatePartPicker } from "@/features/job-cards/components/EstimatePartPicker";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { useBranchStore } from "@/store/branch.store";
import { createPreJobEstimateRequest } from "../api/quotation.api";
import { quotationKeys } from "../api/quotation.keys";
import type { PreJobEstimateLine } from "../types/quotation.types";

type Line = PreJobEstimateLine & { key: number; label: string };

const ngn = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
let nextKey = 0;

function apiMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { message?: string; errors?: { message: string }[] } } })?.response?.data;
  return data?.errors?.map((item) => item.message).join(" ") || data?.message || fallback;
}

/**
 * Estimate prepared before a job card exists (legacy job estimate register). Prices come from
 * the part retail rate, the model labour rate and the service price, as on job estimates.
 */
export function PreJobEstimateDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const branch = useBranchStore((state) => state.activeBranch);
  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [description, setDescription] = useState("");
  const [discount, setDiscount] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState<{ type: Line["type"]; referenceId: string; label: string; quantity: string }>({ type: "PART", referenceId: "", label: "", quantity: "1" });

  const create = useMutation({
    mutationFn: createPreJobEstimateRequest,
    onSuccess: async ({ estimate }) => {
      toast.success(`Estimate ${estimate.estimateNumber} created · ${ngn.format(estimate.amount - (estimate.discountAmount ?? 0))}`);
      await queryClient.invalidateQueries({ queryKey: quotationKeys.all });
      reset();
      onClose();
    },
    onError: (error) => toast.error(apiMessage(error, "The estimate could not be created")),
  });

  function reset() {
    setCustomerId("");
    setVehicleId("");
    setDescription("");
    setDiscount("");
    setLines([]);
    setDraft({ type: "PART", referenceId: "", label: "", quantity: "1" });
  }

  const quantity = Number(draft.quantity);
  const canAdd = Boolean(draft.referenceId) && Number.isFinite(quantity) && quantity > 0 && !lines.some((line) => line.type === draft.type && line.referenceId === draft.referenceId);
  const discountValue = discount === "" ? 0 : Number(discount);
  const problem = !customerId
    ? "Select the customer"
    : !vehicleId
      ? "Select the vehicle"
      : !description.trim()
        ? "Describe the work"
        : !lines.length
          ? "Add at least one part, labour operation or service"
          : !Number.isFinite(discountValue) || discountValue < 0
            ? "Enter a valid discount"
            : null;

  return (
    <ModalFame isOpen={isOpen} onClose={() => !create.isPending && onClose()} title="New estimate" description="An estimate prepared before the vehicle's job card is opened." size="wide">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (problem) return toast.error(problem);
          create.mutate({
            customerId,
            vehicleId,
            description: description.trim(),
            discountAmount: discountValue,
            lines: lines.map(({ type, referenceId, quantity: q }) => ({ type, referenceId, quantity: q })),
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer">
            <CustomerSelectWithCreate value={customerId} onChange={(id) => { setCustomerId(id); setVehicleId(""); }} branchId={branch?.id} />
          </Field>
          <Field label="Vehicle">
            <VehicleSelectWithCreate
              value={vehicleId}
              customerId={customerId}
              onChange={setVehicleId}
              onVehicleSelect={(vehicle) => vehicle.customer?.id && setCustomerId(vehicle.customer.id)}
              branchId={branch?.id}
            />
          </Field>
        </div>
        <Field label="Work to be done">
          <textarea className="min-h-16 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>

        <fieldset className="grid gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Estimate lines</legend>
          <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_7rem_auto] sm:items-end">
            <Field label="Type">
              <select className={inputCls} value={draft.type} onChange={(event) => setDraft({ type: event.target.value as Line["type"], referenceId: "", label: "", quantity: "1" })}>
                <option value="PART">Part</option>
                <option value="LABOUR">Labour operation</option>
                <option value="SERVICE">Service</option>
              </select>
            </Field>
            {draft.type === "PART" ? (
              branch?.id ? (
                <EstimatePartPicker key={branch.id} branchId={branch.id} value={draft.referenceId} onChange={(id, name) => setDraft({ ...draft, referenceId: id, label: name })} />
              ) : (
                <p className="text-sm text-muted-foreground">Select a branch to pick parts.</p>
              )
            ) : (
              <WorkshopPicker
                key={draft.type}
                label={draft.type === "LABOUR" ? "Labour operation" : "Service"}
                endpoint={draft.type === "LABOUR" ? "/service/labour-items" : "/services?isActive=true"}
                collection={draft.type === "LABOUR" ? "labourItems" : "services"}
                value={draft.referenceId}
                onChange={(id) => setDraft({ ...draft, referenceId: id })}
                onSelect={(row) => setDraft((current) => ({ ...current, referenceId: row.id, label: row.name ?? row.description ?? "" }))}
              />
            )}
            <Field label={draft.type === "LABOUR" ? "Hours" : "Quantity"}>
              <input type="number" min="0.01" step="0.01" className={inputCls} value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} />
            </Field>
            <Button
              type="button"
              variant="outline"
              disabled={!canAdd}
              onClick={() => {
                setLines([...lines, { key: (nextKey += 1), type: draft.type, referenceId: draft.referenceId, quantity, label: draft.label || draft.type }]);
                setDraft({ ...draft, referenceId: "", label: "", quantity: "1" });
              }}
            >
              <Plus className="size-4" />
              Add
            </Button>
          </div>
          {lines.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {lines.map((line) => (
                <li key={line.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">{line.type}</span>
                    {line.label}
                    <span className="ml-2 text-muted-foreground">× {line.quantity}</span>
                  </span>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${line.label}`} onClick={() => setLines(lines.filter((item) => item.key !== line.key))}>
                    <Trash2 className="size-4 text-red-500" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Prices are applied when the estimate is saved: part retail rate, the model labour rate and the service price.</p>
        </fieldset>

        <Field label="Discount (NGN, optional)">
          <input type="number" min="0" step="0.01" className={inputCls} value={discount} onChange={(event) => setDiscount(event.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? "Saving…" : "Create estimate"}</Button>
        </div>
      </form>
    </ModalFame>
  );
}
