"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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
          <Button
            onClick={() => setShowForm((v) => !v)}
            variant={showForm ? "outline" : "default"}
            size="sm"
          >
            {showForm ? (
              <><X className="size-4" />Cancel</>
            ) : (
              <><Plus className="size-4" />Add item</>
            )}
          </Button>
        }
      />

      {showForm && <InventoryCreateForm onSuccess={() => setShowForm(false)} />}
      <InventoryTable />
    </div>
  );
}
