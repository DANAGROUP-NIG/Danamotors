"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ModalFame from "@/components/modals/ModalFame";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DELETE_ROLES } from "@/features/auth/roles";
import { useInventory } from "../hooks/use-inventory";
import { InventoryDeleteButton } from "./InventoryDeleteButton";
import { InventoryEditForm } from "./InventoryEditForm";
import type { InventoryItem } from "../types/inventory.types";

const PAGE_SIZE = 10;
const CATEGORIES = ["Engine", "Electrical", "Brakes", "Tyres", "Body", "Fluids", "Filters", "Suspension", "Other"];

export function InventoryTable() {
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { hasAccess } = useAuth();
  const canDelete = hasAccess(DELETE_ROLES);

  const { data, isLoading, isError, isFetching } = useInventory({
    page,
    pageSize: PAGE_SIZE,
    category: categoryFilter || undefined,
  });
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  const editingItem = data?.items?.find((i) => i.id === editingId) ?? null;

  function changeCategory(c: string) { setCategoryFilter(c); setPage(1); }

  if (isError) {
    return (
      <Card><CardContent className="py-12 text-center">
        <p className="text-sm text-red-500">Failed to load inventory. Check the API connection and try again.</p>
      </CardContent></Card>
    );
  }

  const lowStockCount = data?.items.filter((i) => i.quantity <= i.reorderLevel).length ?? 0;

  return (
    <div className="grid gap-4">
      {/* Low-stock alert */}
      {lowStockCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="size-4 shrink-0 text-amber-500" />
          <span><strong>{lowStockCount}</strong> {lowStockCount === 1 ? "item is" : "items are"} at or below reorder level.</span>
        </div>
      )}

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => changeCategory("")}
          className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
            categoryFilter === "" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
          )}
        >
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => changeCategory(c)}
            className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              categoryFilter === c ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e8edf3] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e8edf3] bg-[#f8fafc]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Part</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Reorder at</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Unit cost</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows />
              ) : !data?.items.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {categoryFilter ? `No items in category "${categoryFilter}"` : "No inventory items yet. Add one above."}
                  </td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <InventoryRow
                    key={item.id}
                    item={item}
                    canDelete={canDelete}
                    onEdit={() => setEditingId(item.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > PAGE_SIZE && (
          <div className={cn("flex items-center justify-between border-t border-[#e8edf3] px-4 py-3", isFetching && "opacity-60")}>
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      <ModalFame
        isOpen={!!editingId}
        onClose={() => setEditingId(null)}
        title="Edit inventory item"
      >
        {editingItem && (
          <InventoryEditForm item={editingItem} onSuccess={() => setEditingId(null)} />
        )}
      </ModalFame>
    </div>
  );
}

function InventoryRow({ item, canDelete, onEdit }: {
  item: InventoryItem; canDelete: boolean; onEdit: () => void;
}) {
  const router = useRouter();
  const isLow = item.quantity <= item.reorderLevel;

  return (
    <tr
      className="cursor-pointer border-t border-border transition-colors hover:bg-muted/30"
      onClick={() => router.push(`/inventory/${item.id}`)}
    >
      <td className="px-4 py-3">
        <p className="font-medium">{item.name}</p>
        <p className="text-xs text-muted-foreground">{item.partNumber}</p>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
      <td className="px-4 py-3">
        <span className={cn("font-semibold", isLow ? "text-amber-600" : "text-foreground")}>
          {item.quantity}
        </span>
        {isLow && <AlertTriangle className="ml-1.5 inline size-3.5 text-amber-500" />}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{item.reorderLevel}</td>
      <td className="px-4 py-3 text-muted-foreground">₦{item.unitCost.toLocaleString()}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm" variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label={`Edit ${item.name}`}
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          {canDelete && <InventoryDeleteButton item={item} />}
        </div>
      </td>
    </tr>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-border">
          <td className="px-4 py-3">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="mt-1.5 h-3 w-16 animate-pulse rounded bg-muted" />
          </td>
          {Array.from({ length: 4 }).map((__, j) => (
            <td key={j} className="px-4 py-3"><div className="h-4 w-16 animate-pulse rounded bg-muted" /></td>
          ))}
          <td className="px-4 py-3" />
        </tr>
      ))}
    </>
  );
}
