"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Boxes,
  CheckCircle,
  GitBranch,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Receipt,
  Tag,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { Field, inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { usePart, usePartAlternates, usePartStock } from "../hooks/use-parts";
import { useCreateAlternate, useDeletePart, useSetPartStatus } from "../hooks/use-part-mutations";
import { alternatePartSchema, type AlternatePartFormValues } from "../schemas/inventory.schema";
import { PartForm } from "./PartForm";
import { PartRoleBadge, PartStatusBadge, fmtNaira } from "./PartStatusBadge";
import type { PartMaster } from "../types/inventory.types";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function SectionCard({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          {icon}
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function DetailField({ label, value, mono }: { label: string; value?: ReactNode; mono?: boolean }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className={cn("mt-0.5 text-sm text-slate-700", mono && "font-mono")}>{empty ? "—" : value}</p>
    </div>
  );
}

function AlternateForm({ mainPartId, onDone }: { mainPartId: string; onDone: () => void }) {
  const create = useCreateAlternate(mainPartId);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AlternatePartFormValues>({ resolver: zodResolver(alternatePartSchema) });

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={handleSubmit((values) =>
        create.mutate({ ...values, description: values.description || undefined }, { onSuccess: onDone }),
      )}
    >
      <p className="text-sm text-slate-600">
        The alternate copies category, unit of measure, tax, stock levels, unit rate and store location from the main
        part. You can change them afterwards on the alternate’s own page.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Part number" error={errors.partNumber?.message}>
          <input className={inputCls} placeholder="e.g. 96611P2710" {...register("partNumber")} />
        </Field>
        <Field label="Name" error={errors.name?.message}>
          <input className={inputCls} {...register("name")} />
        </Field>
      </div>
      <Field label="Description (optional)" error={errors.description?.message}>
        <input className={inputCls} {...register("description")} />
      </Field>
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? "Adding…" : "Add alternate"}
      </Button>
    </form>
  );
}

function FamilyRow({ part, current }: { part: PartMaster; current?: boolean }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2">
        {current ? (
          <span className="font-mono text-xs font-medium text-slate-800">{part.partNumber} (this part)</span>
        ) : (
          <Link href={`/inventory/${part.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
            {part.partNumber}
          </Link>
        )}
        <p className="text-xs text-slate-500">{part.name}</p>
      </td>
      <td className="px-3 py-2">
        <PartRoleBadge role={part.role} />
      </td>
      <td className="px-3 py-2 text-slate-600">{fmtNaira(part.unitRate)}</td>
      <td className="px-3 py-2">
        <PartStatusBadge status={part.partStatus} />
      </td>
    </tr>
  );
}

export function PartDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: part, isLoading, error } = usePart(id);
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(INVENTORY_PERMISSIONS.SPAREPART_UPDATE);
  const canDelete = hasPermission(INVENTORY_PERMISSIONS.SPAREPART_DELETE);
  const canCreate = hasPermission(INVENTORY_PERMISSIONS.SPAREPART_CREATE);
  const canReadStock = hasPermission(INVENTORY_PERMISSIONS.STOCK_READ);
  const [editing, setEditing] = useState(false);
  const [addingAlt, setAddingAlt] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const setStatus = useSetPartStatus();
  const del = useDeletePart();

  // For a main part, list its alternates; for an alternate, list its main part's family.
  const familyRootId = part ? (part.role === "MAIN" ? part.id : part.mainPartId) : null;
  const { data: family, isLoading: familyLoading } = usePartAlternates(familyRootId);
  const { data: mainPart } = usePart(part?.role === "ALTERNATE" && part.mainPartId ? part.mainPartId : "");
  const { data: stock, isLoading: stockLoading, isError: stockError } = usePartStock(id, canReadStock);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !part) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/inventory" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Inventory
        </Link>
        <p className="text-sm text-red-500">Part not found.</p>
      </div>
    );
  }

  const totalStock = (stock ?? []).reduce((s, x) => s + x.quantity, 0);
  const belowMin = part.minLevel != null && stock && stock.length > 0 && totalStock <= part.minLevel;
  const siblings = (family ?? []).filter((p) => p.id !== part.id);

  return (
    <div className="px-4 py-6 lg:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/inventory" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Inventory
        </Link>
        <div className="flex flex-wrap gap-2">
          {canEdit &&
            (part.partStatus === "ACTIVE" ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: part.id, partStatus: "BLOCKED" })}
              >
                <Ban className="size-4" /> Block
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: part.id, partStatus: "ACTIVE" })}
              >
                <CheckCircle className="size-4" /> Activate
              </Button>
            ))}
          {canDelete && (
            <Button size="sm" variant="outline" className="gap-1.5 text-red-600" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          {canEdit && (
            <Button size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* ── Header ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-800">{part.name}</h1>
              <p className="mt-1 font-mono text-sm text-slate-500">
                {part.partNumber} · {part.partCode}
              </p>
              {part.role === "ALTERNATE" && mainPart && (
                <p className="mt-1 text-xs text-slate-500">
                  Alternate for{" "}
                  <Link href={`/inventory/${mainPart.id}`} className="font-mono font-medium text-primary hover:underline">
                    {mainPart.partNumber}
                  </Link>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <PartRoleBadge role={part.role} />
              <PartStatusBadge status={part.partStatus} />
            </div>
          </div>
          {part.partStatus === "BLOCKED" && (
            <p className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <Ban className="mt-0.5 size-4 shrink-0" />
              This part is blocked. It cannot be requested on new indents or supplied as an alternate.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField label="Category" value={part.category} />
            <DetailField label="Unit of measure" value={part.uom} />
            <DetailField label="Unit rate" value={fmtNaira(part.unitRate)} />
            <DetailField label="Description" value={part.description} />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <SectionCard icon={<Receipt className="size-4" />} title="Tax">
            <div className="grid grid-cols-2 gap-4">
              <DetailField label="Tax category" value={part.taxCategory} />
              <DetailField label="Tax form" value={part.taxForm} />
            </div>
          </SectionCard>
          <SectionCard icon={<MapPin className="size-4" />} title="Location">
            <div className="grid grid-cols-2 gap-4">
              <DetailField label="Bin location" value={part.binLocation} mono />
              <DetailField label="Store location" value={part.storeLocation} />
            </div>
          </SectionCard>
        </div>

        <SectionCard icon={<Tag className="size-4" />} title="Stock levels">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <DetailField label="Min level" value={part.minLevel} />
            <DetailField label="Max level" value={part.maxLevel} />
            <DetailField label="Reorder qty" value={part.reorderQty} />
            <DetailField label="Total on hand" value={canReadStock ? totalStock : null} />
          </div>
          {belowMin && (
            <p className="mt-4 flex items-center gap-2 text-sm text-amber-700">
              <AlertTriangle className="size-4" /> Total stock is at or below the minimum level.
            </p>
          )}
        </SectionCard>

        {canReadStock && (
          <SectionCard icon={<Boxes className="size-4" />} title="Stock by branch">
            {stockLoading ? (
              <Loader2 className="size-5 animate-spin text-slate-400" />
            ) : stockError ? (
              <p className="text-sm text-red-500">Could not load stock.</p>
            ) : !stock || stock.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stock recorded for this part yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      <th className="px-3 py-2">Branch</th>
                      <th className="px-3 py-2 text-right">On hand</th>
                      <th className="px-3 py-2 text-right">Reserved</th>
                      <th className="px-3 py-2 text-right">Available</th>
                      <th className="px-3 py-2 text-right">Min stock</th>
                      <th className="px-3 py-2">Rack</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.map((s) => (
                      <tr key={s.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{s.branch.name}</td>
                        <td className="px-3 py-2 text-right font-medium">{s.quantity}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{s.reservedQuantity}</td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right font-medium",
                            s.minimumStock > 0 && s.availableQuantity <= s.minimumStock ? "text-amber-700" : "text-emerald-700",
                          )}
                        >
                          {s.availableQuantity}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">{s.minimumStock}</td>
                        <td className="px-3 py-2 text-slate-500">{s.rackLocation ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}

        <SectionCard
          icon={<GitBranch className="size-4" />}
          title={part.role === "MAIN" ? "Alternate parts" : "Part family"}
          action={
            part.role === "MAIN" &&
            canCreate && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddingAlt(true)}>
                <Plus className="size-4" /> Add alternate
              </Button>
            )
          }
        >
          {familyLoading ? (
            <Loader2 className="size-5 animate-spin text-slate-400" />
          ) : part.role === "MAIN" && siblings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No alternates yet. Alternates can be supplied in place of this part on branch indents.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    <th className="px-3 py-2">Part</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Unit rate</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {part.role === "ALTERNATE" && mainPart && <FamilyRow part={mainPart} />}
                  {part.role === "ALTERNATE" && <FamilyRow part={part} current />}
                  {siblings.map((p) => (
                    <FamilyRow key={p.id} part={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <p className="text-xs text-slate-400">
          Created {fmtDateTime(part.createdAt)} · Last updated {fmtDateTime(part.updatedAt)}
        </p>
      </div>

      <ModalFame isOpen={editing} onClose={() => setEditing(false)} title={`Edit ${part.partNumber}`}>
        {editing && <PartForm part={part} onSuccess={() => setEditing(false)} />}
      </ModalFame>

      <ModalFame isOpen={addingAlt} onClose={() => setAddingAlt(false)} title={`Add alternate for ${part.partNumber}`}>
        {addingAlt && <AlternateForm mainPartId={part.id} onDone={() => setAddingAlt(false)} />}
      </ModalFame>

      <ConfirmDeleteModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          del.mutate(part.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              router.push("/inventory");
            },
            onError: () => setConfirmDelete(false),
          })
        }
        title="Delete part?"
        message={`This permanently removes ${part.partNumber} from Part Master. A part that is in use cannot be deleted; block it instead.`}
        isPending={del.isPending}
      />
    </div>
  );
}
