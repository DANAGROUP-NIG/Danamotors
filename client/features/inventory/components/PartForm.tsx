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
import { usePriceCategories } from "../hooks/use-parts";
import { MasterOptions } from "@/components/forms/MasterOptions";
import { partMasterSchema, type PartMasterFormInput, type PartMasterFormValues } from "../schemas/inventory.schema";
import type { PartMaster, PartMasterPayload } from "../types/inventory.types";
import { codeLabel, PART_FLAG_LABELS, PART_TYPE_LABELS } from "../lib/part-codes";

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

const LEGACY_FLAGS = [
  ["blockReserve", "Block reserve"],
  ["topMover", "Top mover"],
  ["includeInTopN", "Include in top-N parts"],
  ["underAmc", "Under AMC"],
] as const;

const day = (value?: string | null) => (value ? value.slice(0, 10) : "");

const sectionCls = "rounded-lg border border-[#e8edf3] bg-slate-50 p-4";
const sectionTitle = "mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground";

interface PartFormProps {
  part?: PartMaster;
  onSuccess?: (part: PartMaster) => void;
}

function toDefaults(part?: PartMaster): Partial<PartMasterFormInput> {
  if (!part)
    return {
      uom: "UNIT", partStatus: "ACTIVE", taxable: true, partFlag: "O", partType: "S", warrantyApplicable: false,
      conversionFactor: 1, blockReserve: false, includeInTopN: false, topMover: false, underAmc: false,
    };
  return {
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
    retailRate: part.retailRate ?? undefined,
    taxable: part.taxable,
    partFlag: part.partFlag,
    partType: (part.partType ?? "S") as PartMasterFormInput["partType"],
    priceCategoryCode: part.priceCategoryCode ?? "",
    binLocation: part.binLocation ?? "",
    storeLocation: part.storeLocation ?? "",
    partStatus: part.partStatus,
    warrantyApplicable: part.warrantyApplicable ?? false,
    warrantyRate: part.warrantyRate ?? undefined,
    vehicleSystem: part.vehicleSystem ?? "",
    vehicleGroup: part.vehicleGroup ?? "",
    applicableModels: (part.applicableModels ?? []).join(", "),
    moq: part.moq ?? undefined,
    conversionFactor: part.conversionFactor ?? 1,
    basicRate: part.basicRate ?? undefined,
    nspDate: day(part.nspDate),
    nlaDate: day(part.nlaDate),
    blockReserve: part.blockReserve ?? false,
    includeInTopN: part.includeInTopN ?? false,
    topMover: part.topMover ?? false,
    underAmc: part.underAmc ?? false,
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

  const { data: priceCategories } = usePriceCategories();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<PartMasterFormInput, unknown, PartMasterFormValues>({
    resolver: zodResolver(partMasterSchema),
    defaultValues: toDefaults(part),
  });

  const pending = create.isPending || update.isPending || openingStock.isPending;

  // Legacy retail rate = dealer rate x the price category's multiplier.
  const selectedCategory = priceCategories?.find((c) => c.code === watch("priceCategoryCode"));
  const dealerRate = Number(watch("unitRate"));
  const derivedRetail =
    selectedCategory && Number.isFinite(dealerRate) && dealerRate > 0
      ? Math.round(dealerRate * selectedCategory.markupMultiplier * 100) / 100
      : null;
  const retailDirty = !!dirtyFields.retailRate;

  function onSubmit(values: PartMasterFormValues) {
    // Optional text fields: send the trimmed value, or omit when empty on create.
    const text = (v?: string) => (v && v.trim() ? v.trim() : isEdit ? "" : undefined);
    const payload: PartMasterPayload = {
      ...values,
      // Blank means "no category" (null clears it on edit).
      priceCategoryCode: values.priceCategoryCode ? values.priceCategoryCode : isEdit ? null : undefined,
      // Leave retail blank to let the server derive it from the category.
      retailRate: values.retailRate,
      // Blank warranty rate falls back to the retail rate on claims.
      warrantyRate: values.warrantyRate ?? (isEdit ? null : undefined),
      taxCategory: text(values.taxCategory),
      taxForm: text(values.taxForm),
      binLocation: text(values.binLocation),
      storeLocation: text(values.storeLocation),
      vehicleSystem: values.vehicleSystem?.trim() || null,
      vehicleGroup: values.vehicleGroup?.trim() || null,
      applicableModels: (values.applicableModels ?? "").split(",").map((code) => code.trim().toUpperCase()).filter(Boolean),
      moq: values.moq ?? null,
      conversionFactor: values.conversionFactor ?? 1,
      basicRate: values.basicRate ?? null,
      nspDate: values.nspDate || null,
      nlaDate: values.nlaDate || null,
    };

    if (!isEdit && (payload.retailRate === undefined || Number.isNaN(payload.retailRate))) delete payload.retailRate;

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
          <Field label="Part number" error={errors.partNumber?.message}>
            <input
              className={inputCls}
              placeholder="e.g. 2630035505"
              {...register("partNumber")}
            />
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
          <Field label="Part type" error={errors.partType?.message}>
            <select className={inputCls} {...register("partType")}>
              {Object.keys(PART_TYPE_LABELS).map((code) => (
                <option key={code} value={code}>
                  {codeLabel(PART_TYPE_LABELS, code)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Purchase source" error={errors.partFlag?.message}>
            <select className={inputCls} {...register("partFlag")}>
              {/* Keep a non-legacy flag already on the part selectable. */}
              {[...new Set([...Object.keys(PART_FLAG_LABELS), ...(part?.partFlag ? [part.partFlag] : [])])].map((code) => (
                <option key={code} value={code}>
                  {codeLabel(PART_FLAG_LABELS, code)}
                </option>
              ))}
            </select>
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
            <MasterOptions id="part-uoms" kind="UOM" extra={UOM_OPTIONS} />
          </Field>
          <Field label="Dealer rate (₦)" error={errors.unitRate?.message}>
            <input type="number" step="0.01" min={0} className={inputCls} {...register("unitRate")} />
          </Field>
          <Field label="Price category" error={errors.priceCategoryCode?.message}>
            <select className={inputCls} {...register("priceCategoryCode")}>
              <option value="">None</option>
              {(priceCategories ?? [])
                .filter((c) => c.isActive || c.code === part?.priceCategoryCode)
                .map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.description} (×{c.markupMultiplier})
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Retail rate (₦)" error={errors.retailRate?.message}>
            <input
              type="number"
              step="0.01"
              min={0}
              className={inputCls}
              placeholder={derivedRetail != null ? String(derivedRetail) : "Optional"}
              {...register("retailRate")}
            />
            {derivedRetail != null && !retailDirty && (
              <span className="text-sm text-muted-foreground">
                {isEdit ? "Recalculated" : "Calculated"} as ₦{derivedRetail.toLocaleString()} from category {selectedCategory?.code} when
                the dealer rate or category changes. Type a value to override.
              </span>
            )}
          </Field>
          <Field label="Tax category (optional)" error={errors.taxCategory?.message}>
            <input className={inputCls} list="part-tax-categories" {...register("taxCategory")} />
            <MasterOptions id="part-tax-categories" kind="TAX_CATEGORY" />
          </Field>
          <Field label="Tax form (optional)" error={errors.taxForm?.message}>
            <input className={inputCls} placeholder="e.g. X" list="part-tax-forms" {...register("taxForm")} />
            <MasterOptions id="part-tax-forms" kind="TAX_FORM" />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
            <input type="checkbox" className="size-4" {...register("taxable")} />
            Taxable
          </label>
        </div>
      </div>

      <div className={sectionCls}>
        <p className={sectionTitle}>Warranty</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" {...register("warrantyApplicable")} />
            <span>
              <span className="font-semibold">Warranty applicable</span>
              <span className="block text-xs text-muted-foreground">
                Only warranty-applicable parts can be charged to warranty or claimed from the manufacturer.
              </span>
            </span>
          </label>
          <Field label="Warranty rate (₦, optional)" error={errors.warrantyRate?.message}>
            <input
              type="number"
              step="0.01"
              min={0}
              className={inputCls}
              placeholder="Uses the retail rate when blank"
              disabled={!watch("warrantyApplicable")}
              {...register("warrantyRate")}
            />
          </Field>
        </div>
      </div>

      <div className={sectionCls}>
        <p className={sectionTitle}>Classification and ordering</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Vehicle system (optional)" error={errors.vehicleSystem?.message}>
            <input className={inputCls} list="part-vehicle-systems" {...register("vehicleSystem")} />
            <MasterOptions id="part-vehicle-systems" kind="VEHICLE_SYSTEM" />
          </Field>
          <Field label="Vehicle group (optional)" error={errors.vehicleGroup?.message}>
            <input className={inputCls} list="part-vehicle-groups" {...register("vehicleGroup")} />
            <MasterOptions id="part-vehicle-groups" kind="VEHICLE_GROUP" />
          </Field>
          <Field label="Models (blank = all models)" error={errors.applicableModels?.message}>
            <input className={inputCls} placeholder="e.g. CRT, RIO" {...register("applicableModels")} />
          </Field>
          <Field label="MOQ (optional)" error={errors.moq?.message}>
            <input type="number" min={0} step="any" className={inputCls} {...register("moq")} />
          </Field>
          <Field label="Conversion factor" error={errors.conversionFactor?.message}>
            <input type="number" min={0} step="any" className={inputCls} {...register("conversionFactor")} />
          </Field>
          <Field label="Base rate, foreign currency (optional)" error={errors.basicRate?.message}>
            <input type="number" min={0} step="0.01" className={inputCls} {...register("basicRate")} />
          </Field>
          <Field label="NSP date (optional)" error={errors.nspDate?.message}>
            <input type="date" className={inputCls} {...register("nspDate")} />
          </Field>
          <Field label="NLA date (optional)" error={errors.nlaDate?.message}>
            <input type="date" className={inputCls} {...register("nlaDate")} />
          </Field>
          {LEGACY_FLAGS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="size-4" {...register(key)} />
              {label}
            </label>
          ))}
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
