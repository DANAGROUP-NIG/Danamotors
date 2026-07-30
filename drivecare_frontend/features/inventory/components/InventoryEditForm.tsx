"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useUpdateInventoryItem } from "../hooks/use-update-inventory-item";
import { updateInventoryItemSchema, type UpdateInventoryItemFormValues } from "../schemas/inventory.schema";
import type { InventoryItem } from "../types/inventory.types";

const CATEGORIES = ["Engine", "Electrical", "Brakes", "Tyres", "Body", "Fluids", "Filters", "Suspension", "Other"];

interface InventoryEditFormProps {
  item: InventoryItem;
  onSuccess?: () => void;
}

export function InventoryEditForm({ item, onSuccess }: InventoryEditFormProps) {
  const update = useUpdateInventoryItem(item.id);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<UpdateInventoryItemFormValues>({
    resolver: zodResolver(updateInventoryItemSchema),
    defaultValues: {
      partNumber: item.partNumber,
      name: item.name,
      description: item.description ?? "",
      category: item.category,
      unitPrice: item.unitPrice,
    },
  });

  useEffect(() => {
    reset({
      partNumber: item.partNumber,
      name: item.name,
      description: item.description ?? "",
      category: item.category,
      unitPrice: item.unitPrice,
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
        <Field label="Unit price (₦)" error={errors.unitPrice?.message}>
          <input type="number" className={inputCls} {...register("unitPrice")} />
        </Field>
      </div>
      <Field label="Description (optional)" error={errors.description?.message}>
        <input className={inputCls} {...register("description")} />
      </Field>
      <Button type="submit" size="sm" disabled={update.isPending}>
        {update.isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
