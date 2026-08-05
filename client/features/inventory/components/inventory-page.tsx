"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import ModalFame from "@/components/modals/ModalFame";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranchStore } from "@/store/branch.store";
import { useBranchStock } from "../hooks/use-branch-stock";
import { useFetchBranches } from "@/features/branches/hooks/useFetchBranches";
import { InventoryCreateForm } from "./InventoryCreateForm";
import { InventoryTable } from "./InventoryTable";
import BranchSwitcher from "@/features/branches/components/BranchSwitcher";

export function InventoryPage() {
  const [showForm, setShowForm] = useState(false);
  const { isGeneralStoreManager, isAdminOrAbove } = useAuth();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const canSwitchBranch = isGeneralStoreManager || isAdminOrAbove;

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
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="size-4" />
              Add part
            </Button>
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
