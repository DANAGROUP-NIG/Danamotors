"use client";

import type { UseFormRegister } from "react-hook-form";
import { Field, inputCls } from "@/components/forms/FormField";
import { useBranchStore } from "@/store/branch.store";
import { useFetchBranches } from "../hooks/useFetchBranches";

type PlacementValues = { code?: string; parentBranchId?: string };

interface BranchPlacementFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
  errors: { code?: { message?: string }; parentBranchId?: { message?: string } };
  /** The branch being edited, so it is not offered as its own parent. */
  selfId?: string;
  /** A branch that already has sub-locations cannot become one. */
  hasSubLocations?: boolean;
}

/**
 * Legacy store-location code and premises grouping. A sub-location is a store
 * or godown at another branch's premises (for example Quick Service Bay at Kia
 * Plaza); Part Query shows it next to its main branch.
 */
export function BranchPlacementFields({ register, errors, selfId, hasSubLocations }: BranchPlacementFieldsProps) {
  useFetchBranches();
  const branches = useBranchStore((s) => s.branches);
  const parents = branches.filter((b) => b.id !== selfId && !b.parentBranchId);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Store code (optional)" error={errors.code?.message}>
        <input className={inputCls} placeholder="e.g. A, QS, DH" maxLength={10} {...register("code" satisfies keyof PlacementValues)} />
      </Field>
      <Field label="Sub-location of (optional)" error={errors.parentBranchId?.message}>
        <select className={inputCls} disabled={hasSubLocations} {...register("parentBranchId" satisfies keyof PlacementValues)}>
          <option value="">None (main branch)</option>
          {parents.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {hasSubLocations && (
          <span className="text-xs text-muted-foreground">This branch has its own sub-locations, so it stays a main branch.</span>
        )}
      </Field>
    </div>
  );
}
