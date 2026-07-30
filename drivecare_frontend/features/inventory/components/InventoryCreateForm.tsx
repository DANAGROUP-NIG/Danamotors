"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useCreateInventoryItem } from "../hooks/use-create-inventory-item";
import { createInventoryItemSchema, type CreateInventoryItemFormValues } from "../schemas/inventory.schema";

const CATEGORIES = ["Engine", "Electrical", "Brakes", "Tyres", "Body", "Fluids", "Filters", "Suspension", "Other"];

interface InventoryCreateFormProps {
  onSuccess?: () => void;
}

export function InventoryCreateForm({ onSuccess }: InventoryCreateFormProps) {
  const create = useCreateInventoryItem();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateInventoryItemFormValues>({
    resolver: zodResolver(createInventoryItemSchema),
    defaultValues: { unitPrice: 0 },
  });

  function onSubmit(values: CreateInventoryItemFormValues) {
    create.mutate(values, { onSuccess: () => { reset(); onSuccess?.(); } });
  }

  return (
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
        <Field label="Unit price (₦)" error={errors.unitPrice?.message}>
          <input type="number" className={inputCls} {...register("unitPrice")} />
        </Field>
      </div>
      <Field label="Description (optional)" error={errors.description?.message}>
        <input className={inputCls} placeholder="Brief description…" {...register("description")} />
      </Field>
      <Button type="submit" disabled={create.isPending} className="mt-1">
        {create.isPending ? "Adding…" : "Add item"}
      </Button>
    </form>
  );
}
