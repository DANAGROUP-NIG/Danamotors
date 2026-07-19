"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { useUpdateInventoryItem } from "../hooks/use-update-inventory-item";
import { updateInventoryItemSchema, type UpdateInventoryItemFormValues } from "../schemas/inventory.schema";
import type { InventoryItem } from "../types/inventory.types";

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

interface InventoryEditFormProps {
  item: InventoryItem;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function InventoryEditForm({ item, onSuccess, onCancel }: InventoryEditFormProps) {
  const update = useUpdateInventoryItem(item.id);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<UpdateInventoryItemFormValues>({
    resolver: zodResolver(updateInventoryItemSchema),
    defaultValues: {
      partNumber: item.partNumber,
      name: item.name,
      description: item.description ?? "",
      category: item.category,
      quantity: item.quantity,
      unitCost: item.unitCost,
      reorderLevel: item.reorderLevel,
      supplierId: item.supplierId ?? "",
    },
  });

  useEffect(() => {
    reset({
      partNumber: item.partNumber,
      name: item.name,
      description: item.description ?? "",
      category: item.category,
      quantity: item.quantity,
      unitCost: item.unitCost,
      reorderLevel: item.reorderLevel,
      supplierId: item.supplierId ?? "",
    });
  }, [item, reset]);

  function onSubmit(values: UpdateInventoryItemFormValues) {
    update.mutate(values, { onSuccess });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Part number" error={errors.partNumber?.message}>
          <input className={inputCls} {...register("partNumber")} />
        </Field>
        <Field label="Name" error={errors.name?.message}>
          <input className={inputCls} {...register("name")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" error={errors.category?.message}>
          <select className={inputCls} {...register("category")}>
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
        <input className={inputCls} {...register("description")} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={update.isPending}>Cancel</Button>
        )}
      </div>
    </form>
  );
}
