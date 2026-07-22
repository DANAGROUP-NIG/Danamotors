"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useBranchStore } from "@/store/branch.store";
import { useVehicles } from "../hooks/use-vehicles";
import { VehicleCreateForm } from "./VehicleCreateForm";
import { VehiclesTable } from "./VehiclesTable";

export function VehiclesPage() {
  const [showForm, setShowForm] = useState(false);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { data } = useVehicles({ page: 1, limit: 1, branchId: activeBranch?.id });

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Vehicles"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "vehicle" : "vehicles"} on record`
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
              <><Plus className="size-4" />Add vehicle</>
            )}
          </Button>
        }
      />

      {showForm && <VehicleCreateForm onSuccess={() => setShowForm(false)} />}
      <VehiclesTable />
    </div>
  );
}
