"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import ModalFame from "@/components/modals/ModalFame";
import { useInventory } from "../hooks/use-inventory";
import { InventoryCreateForm } from "./InventoryCreateForm";
import { InventoryTable } from "./InventoryTable";

export function InventoryPage() {
  const [showForm, setShowForm] = useState(false);
  const { data } = useInventory({ page: 1, pageSize: 1 });

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Inventory"
        description={
          data?.total != null
            ? `${data.total} ${data.total === 1 ? "item" : "items"} in stock`
            : undefined
        }
        actions={
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="size-4" />
            Add item
          </Button>
        }
      />

      <ModalFame
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Add inventory item"
      >
        <InventoryCreateForm onSuccess={() => setShowForm(false)} />
      </ModalFame>
      <InventoryTable />
    </div>
  );
}
