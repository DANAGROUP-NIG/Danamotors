"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { useBranchStore } from "@/store/branch.store";
import { useFetchBranches } from "@/features/branches/hooks/useFetchBranches";
import { useCreatePart, useOpeningStock, useUpdatePart } from "../hooks/use-part-mutations";
import { partMasterSchema, type PartMasterFormInput, type PartMasterFormValues } from "../schemas/inventory.schema";
import type { PartMaster, PartMasterPayload } from "../types/inventory.types";

export const PART_CATEGORIES = [
  "Engine",
  "Electrical",
  "Brakes",
  "Tyres",
  "Body",
  "Lubricants",
  "Fluids",
  "Filters",
  "Suspension",
  "Transmission",
  "Accessories",
  "Other",
];
export const UOM_OPTIONS = ["UNIT", "PCS", "SET", "PAIR", "LITRE", "KG", "METRE", "BOX", "KIT"];

const sectionCls = "rounded-lg border border-[#e8edf3] bg-slate-50 p-4";
const sectionTitle = "mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

interface PartFormProps {
  part?: PartMaster;
  onSuccess?: (part: PartMaster) => void;
}

function toDefaults(part?: PartMaster): Partial<PartMasterFormInput> {
  if (!part) return { uom: "UNIT", partStatus: "ACTIVE" };
  return {
    partCode: part.partCode,
    partNumber: part.partNumber,
    name: part.name,
    category: part.category ?? "",
    uom: part.uom,
    taxCategory: part.taxCategory ?? "",
    taxForm: part.taxForm ?? "",
    minLevel: part.minLevel ?? undefined,
    maxLevel: part.maxLevel ?? undefined,
    reorderQty: part.reorderQty ?? undefined,
    unitRate: part.unitRate,
    binLocation: part.binLocation ?? "",
    storeLocation: part.storeLocation ?? "",
    partStatus: part.partStatus,
  };
}

/** Create and edit form for a Part Master record. */
export function PartForm({ part, onSuccess }: PartFormProps) {
  const isEdit = !!part;
  const create = useCreatePart();
  const update = useUpdatePart(part?.id ?? "");
  const openingStock = useOpeningStock();
  const { hasPermission } = useAuth();
  const branches = useBranchStore((s) => s.branches);
  const canSeedStock =
    !isEdit &&
    hasPermission(INVENTORY_PERMISSIONS.STOCK_UPDATE) &&
    hasPermission(INVENTORY_PERMISSIONS.INVENTORY_CROSS_BRANCH);
  const [stock, setStock] = useState<Record<string, string>>({});

  useFetchBranches(canSeedStock);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<PartMasterFormInput, unknown, PartMasterFormValues>({
    resolver: zodResolver(partMasterSchema),
    defaultValues: toDefaults(part),
  });

  const pending = create.isPending || update.isPending || openingStock.isPending;

  function onSubmit(values: PartMasterFormValues) {
    // Optional text fields: send the trimmed value, or omit when empty on create.
    const text = (v?: string) => (v && v.trim() ? v.trim() : isEdit ? "" : undefined);
    const payload: PartMasterPayload = {
      ...values,
      taxCategory: text(values.taxCategory),
      taxForm: text(values.taxForm),
      binLocation: text(values.binLocation),
      storeLocation: text(values.storeLocation),
    };

    if (isEdit) {
      // Send only what changed, but keep min and max together so the server can compare them.
      const changed = Object.fromEntries(
        Object.entries(payload).filter(([key]) => dirtyFields[key as keyof PartMasterFormValues]),
      ) as Partial<PartMasterPayload>;
      if ("minLevel" in changed || "maxLevel" in changed) {
        changed.minLevel = payload.minLevel;
        changed.maxLevel = payload.maxLevel;
      }
      update.mutate(changed, {
        onSuccess: (saved) => {
          reset(toDefaults(saved));
          onSuccess?.(saved);
        },
      });
      return;
    }

    create.mutate(payload, {
      onSuccess: (saved) => {
        const entries = Object.entries(stock)
          .map(([branchId, qty]) => ({ branchId, partId: saved.id, quantity: Number(qty) }))
          .filter((e) => Number.isInteger(e.quantity) && e.quantity > 0);
        const done = () => {
          reset(toDefaults());
          setStock({});
          onSuccess?.(saved);
        };
        if (entries.length) openingStock.mutate(entries, { onSettled: done });
        else done();
      },
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={sectionCls}>
        <p className={sectionTitle}>Identification</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Part code" error={errors.partCode?.message}>
            <input className={inputCls} placeholder="e.g. KIA-OIL-001" {...register("partCode")} />
          </Field>
          <Field label="Part number" error={errors.partNumber?.message}>
            <input className={inputCls} placeholder="e.g. 2630035505" {...register("partNumber")} />
          </Field>
          <Field label="Name" error={errors.name?.message}>
            <input className={inputCls} placeholder="e.g. FILTER ASSY-ENGINE OIL" {...register("name")} />
          </Field>
          <Field label="Category" error={errors.category?.message}>
            <input className={inputCls} list="part-categories" placeholder="Select or type" {...register("category")} />
            <datalist id="part-categories">
              {PART_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Status" error={errors.partStatus?.message}>
            <select className={inputCls} {...register("partStatus")}>
              <option value="ACTIVE">Active</option>
              <option value="BLOCKED">Blocked</option>
            </select>
          </Field>
        </div>
      </div>

      <div className={sectionCls}>
        <p className={sectionTitle}>Pricing and tax</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Unit of measure" error={errors.uom?.message}>
            <input className={inputCls} list="part-uoms" {...register("uom")} />
            <datalist id="part-uoms">
              {UOM_OPTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Field>
          <Field label="Unit rate (₦)" error={errors.unitRate?.message}>
            <input type="number" step="0.01" min={0} className={inputCls} {...register("unitRate")} />
          </Field>
          <Field label="Tax category (optional)" error={errors.taxCategory?.message}>
            <input className={inputCls} {...register("taxCategory")} />
          </Field>
          <Field label="Tax form (optional)" error={errors.taxForm?.message}>
            <input className={inputCls} placeholder="e.g. X" {...register("taxForm")} />
          </Field>
        </div>
      </div>

      <div className={sectionCls}>
        <p className={sectionTitle}>Stock levels and location</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Min level (optional)" error={errors.minLevel?.message}>
            <input type="number" min={0} className={inputCls} {...register("minLevel")} />
          </Field>
          <Field label="Max level (optional)" error={errors.maxLevel?.message}>
            <input type="number" min={0} className={inputCls} {...register("maxLevel")} />
          </Field>
          <Field label="Reorder qty (optional)" error={errors.reorderQty?.message}>
            <input type="number" min={0} className={inputCls} {...register("reorderQty")} />
          </Field>
          <Field label="Bin location (optional)" error={errors.binLocation?.message}>
            <input className={inputCls} placeholder="e.g. A-12" {...register("binLocation")} />
          </Field>
          <Field label="Store location (optional)" error={errors.storeLocation?.message}>
            <input className={inputCls} placeholder="e.g. MAINSTORE" {...register("storeLocation")} />
          </Field>
        </div>
      </div>

      {canSeedStock && (
        <div className={sectionCls}>
          <div className="mb-3 flex items-center gap-2">
            <PackagePlus className="size-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Opening stock (optional)</p>
          </div>
          {branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No branches available.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {branches.map((b) => (
                <label key={b.id} className="grid grid-cols-[1fr_96px] items-center gap-2">
                  <span className="truncate text-sm text-foreground">{b.name}</span>
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    placeholder="0"
                    value={stock[b.id] ?? ""}
                    onChange={(e) => setStock((prev) => ({ ...prev, [b.id]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <Button type="submit" disabled={pending || (isEdit && !isDirty)} className="mt-1">
        {pending ? "Saving…" : isEdit ? "Save changes" : "Create part"}
      </Button>
    </form>
  );
}
