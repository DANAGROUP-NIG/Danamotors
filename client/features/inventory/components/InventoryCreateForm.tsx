"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranchStore } from "@/store/branch.store";
import { useFetchBranches } from "@/features/branches/hooks/useFetchBranches";
import { useCreateInventoryItem } from "../hooks/use-create-inventory-item";
import { createInventoryItemSchema, type CreateInventoryItemFormValues } from "../schemas/inventory.schema";
import type { BranchStockEntry } from "../types/inventory.types";

const CATEGORIES = ["Engine", "Electrical", "Brakes", "Tyres", "Body", "Fluids", "Filters", "Suspension", "Other"];

type BranchStockState = Record<string, { quantity: string; minimumStock: string; rackLocation: string }>;

interface InventoryCreateFormProps {
  onSuccess?: () => void;
}

export function InventoryCreateForm({ onSuccess }: InventoryCreateFormProps) {
  const create = useCreateInventoryItem();
  const { isGeneralStoreManager, isSuperAdmin } = useAuth();
  const canStockAllBranches = isGeneralStoreManager || isSuperAdmin;
  const branches = useBranchStore((s) => s.branches);
  const [branchStock, setBranchStock] = useState<BranchStockState>({});

  useFetchBranches(canStockAllBranches);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateInventoryItemFormValues>({
    resolver: zodResolver(createInventoryItemSchema),
    defaultValues: { unitPrice: 0 },
  });

  function onSubmit(values: CreateInventoryItemFormValues) {
    const stockEntries: BranchStockEntry[] | undefined = canStockAllBranches
      ? branches
          .map((b) => ({
            branchId: b.id,
            quantity: Number(branchStock[b.id]?.quantity ?? 0),
            minimumStock: Number(branchStock[b.id]?.minimumStock ?? 0),
            rackLocation: branchStock[b.id]?.rackLocation?.trim() || undefined,
          }))
          .filter((e) => e.quantity > 0)
      : undefined;

    create.mutate(
      { ...values, branchStock: stockEntries },
      {
        onSuccess: () => {
          reset();
          setBranchStock({});
          onSuccess?.();
        },
      },
    );
  }

  function setEntry(branchId: string, field: keyof BranchStockState[string], value: string) {
    setBranchStock((prev) => {
      const current = prev[branchId] ?? { quantity: "", minimumStock: "", rackLocation: "" };
      return { ...prev, [branchId]: { ...current, [field]: value } };
    });
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

      {canStockAllBranches && (
        <div className="rounded-lg border border-[#e8edf3] bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <PackagePlus className="size-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Stock all branches</p>
          </div>
          {branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No branches available.</p>
          ) : (
            <div className="grid gap-2">
              <div className="grid grid-cols-[1fr_80px_80px_1fr] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Branch</span>
                <span>Qty</span>
                <span>Minimum stock</span>
                <span>Rack location</span>
              </div>
              {branches.map((b) => (
                <div key={b.id} className="grid grid-cols-[1fr_80px_80px_1fr] items-center gap-2">
                  <span className="truncate text-sm text-foreground">{b.name}</span>
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    placeholder="0"
                    value={branchStock[b.id]?.quantity ?? ""}
                    onChange={(e) => setEntry(b.id, "quantity", e.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    placeholder="0"
                    value={branchStock[b.id]?.minimumStock ?? ""}
                    onChange={(e) => setEntry(b.id, "minimumStock", e.target.value)}
                  />
                  <input
                    className={inputCls}
                    placeholder="Aisle 3 Rack 7"
                    value={branchStock[b.id]?.rackLocation ?? ""}
                    onChange={(e) => setEntry(b.id, "rackLocation", e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Button type="submit" disabled={create.isPending} className="mt-1">
        {create.isPending ? "Adding…" : "Add item"}
      </Button>
    </form>
  );
}
