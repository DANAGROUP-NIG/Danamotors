"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Download, FileSpreadsheet, BookOpen } from "lucide-react";
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
import { InventoryTable } from "./InventoryTable";
import { PartForm } from "./PartForm";
import { PartMasterTable } from "./PartMasterTable";
import { useParts } from "../hooks/use-parts";
import { cn } from "@/lib/utils";
import type { BranchStockItem } from "../types/inventory.types";
import BranchSwitcher from "@/features/branches/components/BranchSwitcher";

function flattenStock(stock: BranchStockItem): Record<string, string | number> {
  return {
    partName: stock.part.name,
    partNumber: stock.part.partNumber,
    partCategory: stock.part.priceCategoryCode ?? "",
    unitPrice: stock.part.unitPrice ?? "",
    quantity: stock.quantity,
    minimumStock: stock.minimumStock,
    maximumStock: stock.maximumStock ?? "",
    rackLocation: stock.rackLocation ?? "",
    reservedQuantity: stock.reservedQuantity,
  };
}

function exportColumns(canSeeCost = true) {
  return [
    { key: "partName", label: "Part Name" },
    { key: "partNumber", label: "Part Number" },
    { key: "partCategory", label: "Part Category" },
    { key: "unitPrice", label: "Unit Rate" },
    { key: "quantity", label: "Quantity" },
    { key: "minimumStock", label: "Minimum Stock" },
    { key: "maximumStock", label: "Maximum Stock" },
    { key: "rackLocation", label: "Rack Location" },
    { key: "reservedQuantity", label: "Reserved Quantity" },
  ].filter((column) => canSeeCost || column.key !== "unitPrice");
}

function ExportInventoryButton() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { data: stockData } = useBranchStock(activeBranch?.id ?? null);
  const stock = stockData ?? [];
  const disabled = stock.length === 0;
  const canSeeCost = useAuth().hasPermission(INVENTORY_PERMISSIONS.SPAREPART_COST_READ);

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
            exportColumns(canSeeCost),
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
            exportColumns(canSeeCost),
          )
        }
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

const TABS = [
  { id: "parts", label: "Part Master" },
  { id: "stock", label: "Branch stock" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export function InventoryPage() {
  const [tab, setTab] = useState<Tab>("parts");
  const [showForm, setShowForm] = useState(false);
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(INVENTORY_PERMISSIONS.SPAREPART_CREATE);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const canSwitchBranch = hasPermission(INVENTORY_PERMISSIONS.INVENTORY_CROSS_BRANCH);

  useFetchBranches(canSwitchBranch);

  const { data: stockData } = useBranchStock(activeBranch?.id ?? null);
  const { data: partData } = useParts({ page: 1, limit: 1 });
  const itemCount = stockData?.length ?? 0;
  const partCount = partData?.total;

  const description =
    tab === "parts"
      ? partCount != null
        ? `${partCount} ${partCount === 1 ? "part" : "parts"} in Part Master`
        : undefined
      : activeBranch
        ? `${itemCount} ${itemCount === 1 ? "item" : "items"} in stock at ${activeBranch.name}`
        : undefined;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Part Master"
        description={description}
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {tab === "stock" && canSwitchBranch && (
              <div className="w-full sm:w-48">
                <BranchSwitcher />
              </div>
            )}
            {tab === "stock" && <ExportInventoryButton />}
            {tab === "parts" && (
              <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
                <Link href="/inventory/part-catalogue">
                  <BookOpen className="size-4" />
                  Mobis catalogue
                </Link>
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => setShowForm(true)} size="sm">
                <Plus className="size-4" />
                Add part
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Inventory views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ModalFame isOpen={showForm} onClose={() => setShowForm(false)} title="Add part">
        <PartForm onSuccess={() => setShowForm(false)} />
      </ModalFame>

      {tab === "parts" ? <PartMasterTable /> : <InventoryTable />}
    </div>
  );
}
