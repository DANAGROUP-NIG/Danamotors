"use client";

import { useState } from "react";
import { Plus, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import ModalFame from "@/components/modals/ModalFame";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { useBranchStore } from "@/store/branch.store";
import { useBranchStock } from "../hooks/use-branch-stock";
import { useFetchBranches } from "@/features/branches/hooks/useFetchBranches";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";
import { InventoryCreateForm } from "./InventoryCreateForm";
import { InventoryTable } from "./InventoryTable";
import type { BranchStockItem } from "../types/inventory.types";
import BranchSwitcher from "@/features/branches/components/BranchSwitcher";

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

function ExportInventoryButton() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { data: stockData } = useBranchStock(activeBranch?.id ?? null);
  const stock = stockData ?? [];
  const disabled = stock.length === 0;

  function filename() {
    const branchSuffix = activeBranch?.name ? `${activeBranch.name}-` : "";
    return `dana-motors-inventory-${branchSuffix}${new Date().toISOString().split("T")[0]}`;
  }

  return (
    <ActionMenu
      align="end"
      trigger={
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-9 gap-1.5"
        >
          <Download className="size-4" />
          Export
        </Button>
      }
    >
      <ActionMenuItem
        icon={<Download className="size-4" />}
        onClick={() =>
          downloadCsv(
            filename(),
            stock.map(flattenStock),
            exportColumns(),
          )
        }
      >
        Export as CSV
      </ActionMenuItem>
      <ActionMenuItem
        icon={<FileSpreadsheet className="size-4" />}
        onClick={() =>
          downloadExcel(
            filename(),
            stock.map(flattenStock),
            exportColumns(),
          )
        }
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

export function InventoryPage() {
  const [showForm, setShowForm] = useState(false);
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(INVENTORY_PERMISSIONS.SPAREPART_CREATE);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const canSwitchBranch = hasPermission(INVENTORY_PERMISSIONS.INVENTORY_CROSS_BRANCH);

  useFetchBranches(canSwitchBranch);

  const { data: stockData } = useBranchStock(activeBranch?.id ?? null);
  const itemCount = stockData?.length ?? 0;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Inventory"
        description={
          activeBranch
            ? `${itemCount} ${itemCount === 1 ? "item" : "items"} in stock at ${activeBranch.name}`
            : undefined
        }
        actions={
          <div className="flex items-center gap-3">
            {canSwitchBranch && <div className="w-48"><BranchSwitcher /></div>}
            <ExportInventoryButton />
            {canCreate && (
              <Button onClick={() => setShowForm(true)} size="sm">
                <Plus className="size-4" />
                Add part
              </Button>
            )}
          </div>
        }
      />

      <ModalFame
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Add spare part"
      >
        <InventoryCreateForm onSuccess={() => setShowForm(false)} />
      </ModalFame>
      <InventoryTable />
    </div>
  );
}
