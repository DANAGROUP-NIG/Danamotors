"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import ModalFame from "@/components/modals/ModalFame";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { VEHICLE_CREATE_ROLES } from "@/features/auth/roles";
import { useVehicles } from "../hooks/use-vehicles";
import { VehicleCreateForm } from "./VehicleCreateForm";
import { VehiclesTable } from "./VehiclesTable";

export function VehiclesPage() {
  const [showForm, setShowForm] = useState(false);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canCreate = hasAccess(VEHICLE_CREATE_ROLES);
  const { data } = useVehicles({
    page: 1,
    limit: 1,
    branchId: activeBranch?.id,
  });

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
          canCreate ? (
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="size-4" />
              Add vehicle
            </Button>
          ) : undefined
        }
      />

      {canCreate && (
        <ModalFame
          isOpen={showForm}
          onClose={() => setShowForm(false)}
          title="Add vehicle"
        >
          <VehicleCreateForm onSuccess={() => setShowForm(false)} />
        </ModalFame>
      )}
      <VehiclesTable />
    </div>
  );
}
