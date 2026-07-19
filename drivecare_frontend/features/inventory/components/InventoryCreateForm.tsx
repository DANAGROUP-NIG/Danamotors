"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateInventoryItem } from "../hooks/use-create-inventory-item";
import { createInventoryItemSchema, type CreateInventoryItemFormValues } from "../schemas/inventory.schema";

const inputCls = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  );
}

const CATEGORIES = ["Engine", "Electrical", "Brakes", "Tyres", "Body", "Fluids", "Filters", "Suspension", "Other"];

interface InventoryCreateFormProps {
  onSuccess?: () => void;
}

export function InventoryCreateForm({ onSuccess }: InventoryCreateFormProps) {
  const create = useCreateInventoryItem();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateInventoryItemFormValues>({
    resolver: zodResolver(createInventoryItemSchema),
    defaultValues: { quantity: 0, unitCost: 0, reorderLevel: 5 },
  });

  function onSubmit(values: CreateInventoryItemFormValues) {
    create.mutate(values, { onSuccess: () => { reset(); onSuccess?.(); } });
  }

  return (
    <Card>
      <CardHeader><CardTitle>Add inventory item</CardTitle></CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Part number" error={errors.partNumber?.message}>
              <input className={inputCls} placeholder="PT-00123" {...register("partNumber")} />
            </Field>
            <Field label="Name" error={errors.name?.message}>
              <input className={inputCls} placeholder="Oil filter" {...register("name")} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" error={errors.category?.message}>
              <select className={inputCls} {...register("category")}>
                <option value="">Select category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Supplier ID (optional)" error={errors.supplierId?.message}>
              <input className={inputCls} {...register("supplierId")} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Quantity" error={errors.quantity?.message}>
              <input type="number" className={inputCls} {...register("quantity")} />
            </Field>
            <Field label="Unit cost (₦)" error={errors.unitCost?.message}>
              <input type="number" className={inputCls} {...register("unitCost")} />
            </Field>
            <Field label="Reorder level" error={errors.reorderLevel?.message}>
              <input type="number" className={inputCls} {...register("reorderLevel")} />
            </Field>
          </div>
          <Field label="Description (optional)" error={errors.description?.message}>
            <input className={inputCls} placeholder="Brief description…" {...register("description")} />
          </Field>
          <Button type="submit" disabled={create.isPending} className="mt-1">
            {create.isPending ? "Adding…" : "Add item"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
