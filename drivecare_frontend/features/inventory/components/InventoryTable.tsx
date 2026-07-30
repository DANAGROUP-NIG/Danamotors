"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Pencil, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ModalFame from "@/components/modals/ModalFame";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DELETE_ROLES } from "@/features/auth/roles";
import { useBranchStore } from "@/store/branch.store";
import { useBranchStock } from "../hooks/use-branch-stock";
import { InventoryDeleteButton } from "./InventoryDeleteButton";
import { InventoryEditForm } from "./InventoryEditForm";
import type { BranchStockItem } from "../types/inventory.types";

const PAGE_SIZE = 10;
const CATEGORIES = ["Engine", "Electrical", "Brakes", "Tyres", "Body", "Fluids", "Filters", "Suspension", "Other"];

export function InventoryTable() {
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { hasAccess } = useAuth();
  const canDelete = hasAccess(DELETE_ROLES);
  const activeBranch = useBranchStore((s) => s.activeBranch);

  const { data: stockData, isLoading, isError, isFetching } = useBranchStock(activeBranch?.id ?? null);

  const filtered = useMemo(() => {
    if (!stockData) return [];
    let items = stockData;
    if (categoryFilter) {
      items = items.filter((s) => s.part.category === categoryFilter);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      items = items.filter((s) =>
        s.part.name.toLowerCase().includes(q) ||
        s.part.partNumber.toLowerCase().includes(q)
      );
    }
    return items;
  }, [stockData, categoryFilter, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const editingItem = stockData?.find((s) => s.id === editingId) ?? null;

  function changeCategory(c: string) { setCategoryFilter(c); setPage(1); }
  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

  if (!activeBranch) {
    return (
      <Card><CardContent className="py-12 text-center">
        <p className="text-sm text-muted-foreground">Select a branch to view inventory.</p>
      </CardContent></Card>
    );
  }

  if (isError) {
    return (
      <Card><CardContent className="py-12 text-center">
        <p className="text-sm text-red-500">Failed to load inventory. Check the API connection and try again.</p>
      </CardContent></Card>
    );
  }

  const columns: Column<BranchStockItem>[] = [
    {
      header: "Part",
      render: (stock) => (
        <>
          <p className="font-medium">{stock.part.name}</p>
          <p className="text-xs text-muted-foreground">{stock.part.partNumber}</p>
        </>
      ),
    },
    {
      header: "Category",
      render: (stock) => <span className="text-muted-foreground">{stock.part.category}</span>,
    },
    {
      header: "Qty",
      render: (stock) => {
        const isLow = stock.quantity <= stock.minimumStock;
        return (
          <span className={cn("font-semibold", isLow ? "text-amber-600" : "text-foreground")}>
            {stock.quantity}
            {isLow && <AlertTriangle className="ml-1.5 inline size-3.5 text-amber-500" />}
          </span>
        );
      },
    },
    {
      header: "Reorder at",
      render: (stock) => <span className="text-muted-foreground">{stock.minimumStock}</span>,
    },
    {
      header: "Unit price",
      render: (stock) => <span className="text-muted-foreground">₦{stock.part.unitPrice.toLocaleString()}</span>,
    },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (stock) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm" variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label={`Edit ${stock.part.name}`}
            onClick={() => setEditingId(stock.id)}
          >
            <Pencil className="size-3.5" />
          </Button>
          {canDelete && <InventoryDeleteButton item={stock.part} />}
        </div>
      ),
    },
  ];

  const lowStockCount = filtered.filter((s) => s.quantity <= s.minimumStock).length;

  return (
    <div className="grid gap-4">
      <DataTable<BranchStockItem>
        columns={columns}
        data={paginated}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={categoryFilter ? `No items in category "${categoryFilter}"` : "No inventory items yet. Add a part above."}
        rowKey={(s) => s.id}
        onRowClick={(s) => router.push(`/inventory/${s.part.id}`)}
        page={page}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        totalPages={totalPages}
        onPageChange={setPage}
      >
        {/* Low-stock alert */}
        {lowStockCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="size-4 shrink-0 text-amber-500" />
            <span><strong>{lowStockCount}</strong> {lowStockCount === 1 ? "item is" : "items are"} at or below reorder level.</span>
          </div>
        )}

        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          onSearch={commitSearch}
          onClearSearch={clearSearch}
          placeholder="Search by part name or number…"
          filters={
            <DataTableFilterChips
              options={[{ label: "All", value: "" }, ...CATEGORIES.map((c) => ({ label: c, value: c }))]}
              selected={categoryFilter}
              onChange={changeCategory}
            />
          }
        />
      </DataTable>

      {/* Edit modal */}
      <ModalFame
        isOpen={!!editingId}
        onClose={() => setEditingId(null)}
        title="Edit spare part"
      >
        {editingItem && (
          <InventoryEditForm item={editingItem.part} onSuccess={() => setEditingId(null)} />
        )}
      </ModalFame>
    </div>
  );
}
