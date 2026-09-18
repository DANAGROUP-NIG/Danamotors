"use client";

import { useState, useMemo } from "react";
import {
  Pencil,
  Eye,
  Download,
  Share2,
  Mail,
  MessageCircle,
  Link2,
  Trash2,
  FileSpreadsheet,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ModalFame from "@/components/modals/ModalFame";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import {
  downloadCsv,
  downloadExcel,
  shareItems,
  openMailto,
  openWhatsApp,
  copyToClipboard,
  pluralize,
} from "@/lib/table-actions";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { useBranchStore } from "@/store/branch.store";
import { useBranchStock } from "../hooks/use-branch-stock";
import { useBulkDeleteInventory } from "../hooks/use-bulk-delete-inventory";
import { InventoryEditForm } from "./InventoryEditForm";
import type { BranchStockItem } from "../types/inventory.types";

const PAGE_SIZE = 10;
const CATEGORIES = ["Engine", "Electrical", "Brakes", "Tyres", "Body", "Fluids", "Filters", "Suspension", "Other"];

function formatCurrency(amount: number) {
  return `₦${amount.toLocaleString()}`;
}

function formatInventoryText(stock: BranchStockItem) {
  const lines = [
    `*${stock.part.name}*`,
    `Part Number: ${stock.part.partNumber}`,
    `Category: ${stock.part.category}`,
    `Quantity: ${stock.quantity}`,
    `Minimum Stock: ${stock.minimumStock}`,
    `Unit Price: ${formatCurrency(stock.part.unitPrice)}`,
  ];
  if (stock.rackLocation) lines.push(`Rack Location: ${stock.rackLocation}`);
  return lines.join("\n");
}

function flattenStock(stock: BranchStockItem): Record<string, string | number> {
  return {
    partName: stock.part.name,
    partNumber: stock.part.partNumber,
    category: stock.part.category,
    unitPrice: stock.part.unitPrice,
    quantity: stock.quantity,
    minimumStock: stock.minimumStock,
    maximumStock: stock.maximumStock ?? "",
    rackLocation: stock.rackLocation ?? "",
    reservedQuantity: stock.reservedQuantity,
  };
}

function exportColumns() {
  return [
    { key: "partName", label: "Part Name" },
    { key: "partNumber", label: "Part Number" },
    { key: "category", label: "Category" },
    { key: "unitPrice", label: "Unit Price" },
    { key: "quantity", label: "Quantity" },
    { key: "minimumStock", label: "Minimum Stock" },
    { key: "maximumStock", label: "Maximum Stock" },
    { key: "rackLocation", label: "Rack Location" },
    { key: "reservedQuantity", label: "Reserved Quantity" },
  ];
}

export function InventoryTable() {
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deleteCandidates, setDeleteCandidates] = useState<BranchStockItem[] | null>(null);
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(INVENTORY_PERMISSIONS.SPAREPART_UPDATE);
  const canDelete = hasPermission(INVENTORY_PERMISSIONS.SPAREPART_DELETE);
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

  const selection = useDataTableSelection<BranchStockItem>({
    data: filtered,
    rowKey: (s) => s.id,
  });

  const bulkDelete = useBulkDeleteInventory();

  const editingItem = stockData?.find((s) => s.id === editingId) ?? null;

  function changeCategory(c: string) { setCategoryFilter(c); setPage(1); }
  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

  function exportSelected(items: BranchStockItem[]) {
    downloadCsv(
      `inventory-${new Date().toISOString().split("T")[0]}`,
      items.map(flattenStock),
      exportColumns(),
    );
  }

  function exportSelectedExcel(items: BranchStockItem[]) {
    downloadExcel(
      `inventory-${new Date().toISOString().split("T")[0]}`,
      items.map(flattenStock),
      exportColumns(),
    );
  }

  function shareSelected(items: BranchStockItem[]) {
    const text = items.map(formatInventoryText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Dana Motors Inventory Items`,
      text,
    });
  }

  function emailSelected(items: BranchStockItem[]) {
    const body = items.map(formatInventoryText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} Inventory Item${items.length === 1 ? "" : "s"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: BranchStockItem[]) {
    const message = items.map(formatInventoryText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  function confirmDeleteSelected(items: BranchStockItem[]) {
    setDeleteCandidates(items);
  }

  function handleConfirmDelete() {
    if (!deleteCandidates) return;
    bulkDelete.mutate(deleteCandidates, {
      onSuccess: () => {
        setDeleteCandidates(null);
        selection.clear();
      },
    });
  }

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
      header: "Minimum stock",
      render: (stock) => <span className="text-muted-foreground">{stock.minimumStock}</span>,
    },
    {
      header: "Rack location",
      render: (stock) => <span className="text-muted-foreground">{stock.rackLocation ?? "—"}</span>,
    },
    {
      header: "Unit price",
      render: (stock) => <span className="text-muted-foreground">{formatCurrency(stock.part.unitPrice)}</span>,
    },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (stock) => (
        <DataTableRowActions
          item={stock}
          quickActions={[
            canEdit && {
              id: "edit",
              label: "Edit",
              icon: <Pencil className="size-3.5" />,
              onClick: () => setEditingId(stock.id),
            },
          ]}
          actions={[
            {
              id: "view",
              label: "View details",
              icon: <Eye className="size-4" />,
              onClick: () => setEditingId(stock.id),
            },
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([stock]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: stock.part.name,
                  text: formatInventoryText(stock),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Inventory: ${stock.part.name}`,
                  body: formatInventoryText(stock),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatInventoryText(stock) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              shortcut: "⌘C",
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/inventory/${stock.part.id}`,
                  "Inventory link copied",
                ),
            },
            canDelete && {
              id: "delete",
              label: "Delete",
              icon: <Trash2 className="size-4" />,
              destructive: true,
              onClick: () => setDeleteCandidates([stock]),
            },
          ]}
        />
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
        page={page}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        totalPages={totalPages}
        onPageChange={setPage}
        selection={selection}
      >
        {lowStockCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="size-4 shrink-0 text-amber-500" />
            <span><strong>{lowStockCount}</strong> {lowStockCount === 1 ? "item is" : "items are"} at or below minimum stock.</span>
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

        <DataTableBulkToolbar
          selectedCount={selection.selectedIds.size}
          totalCount={filtered.length}
          selectedItems={selection.selectedItems}
          onClear={selection.clear}
          actions={[
            {
              id: "export",
              label: "CSV",
              icon: <Download className="size-3.5" />,
              variant: "ghost",
              onClick: exportSelected,
            },
            {
              id: "excel",
              label: "Excel",
              icon: <FileSpreadsheet className="size-3.5" />,
              variant: "ghost",
              onClick: exportSelectedExcel,
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-3.5" />,
              variant: "ghost",
              onClick: shareSelected,
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-3.5" />,
              variant: "ghost",
              onClick: emailSelected,
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-3.5" />,
              variant: "ghost",
              onClick: whatsappSelected,
            },
            canDelete && {
              id: "delete",
              label: "Delete",
              icon: <Trash2 className="size-3.5" />,
              variant: "destructive",
              onClick: confirmDeleteSelected,
            },
          ]}
        />
      </DataTable>

      <ModalFame
        isOpen={!!editingId}
        onClose={() => setEditingId(null)}
        title="Edit spare part"
      >
        {editingItem && (
          <InventoryEditForm item={editingItem.part} onSuccess={() => setEditingId(null)} />
        )}
      </ModalFame>

      <ConfirmDeleteModal
        isOpen={!!deleteCandidates}
        onClose={() => setDeleteCandidates(null)}
        onConfirm={handleConfirmDelete}
        title={
          deleteCandidates && deleteCandidates.length > 1
            ? `Delete ${pluralize(deleteCandidates.length, "item")}?`
            : "Delete inventory item?"
        }
        message={
          deleteCandidates && deleteCandidates.length > 1
            ? `This will permanently remove ${pluralize(deleteCandidates.length, "item")}. This cannot be undone.`
            : `This will permanently remove ${deleteCandidates?.[0]?.part.name ?? "this item"}. This cannot be undone.`
        }
        isPending={bulkDelete.isPending}
      />
    </div>
  );
}
