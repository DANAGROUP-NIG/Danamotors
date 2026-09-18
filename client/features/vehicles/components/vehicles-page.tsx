"use client";

import { useState } from "react";
import { Plus, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import ModalFame from "@/components/modals/ModalFame";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";
import { useVehicles } from "../hooks/use-vehicles";
import { VehicleCreateForm } from "./VehicleCreateForm";
import { VehiclesTable } from "./VehiclesTable";
import type { Vehicle } from "../types/vehicle.types";

function exportColumns() {
  return [
    { key: "make", label: "Make" },
    { key: "model", label: "Model" },
    { key: "vin", label: "VIN" },
    { key: "registrationNumber", label: "Registration Number" },
    { key: "customer", label: "Customer" },
    { key: "year", label: "Year" },
    { key: "color", label: "Color" },
    { key: "ownershipStatus", label: "Ownership" },
  ];
}

function toExportableVehicle(v: Vehicle): Record<string, string> {
  return {
    make: v.make ?? "",
    model: v.model ?? "",
    vin: v.vin,
    registrationNumber: v.registrationNumber ?? "",
    customer: v.customer ? `${v.customer.firstName} ${v.customer.lastName}` : "",
    year: v.year != null ? String(v.year) : "",
    color: v.color ?? "",
    ownershipStatus: v.ownershipStatus ?? "",
  };
}

function ExportVehiclesButton() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { data } = useVehicles({
    page: 1,
    limit: 1000,
    branchId: activeBranch?.id,
  });
  const vehicles = data?.vehicles ?? [];
  const disabled = vehicles.length === 0;

  function filename() {
    return `dana-motors-vehicles-${new Date().toISOString().split("T")[0]}`;
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
            vehicles.map(toExportableVehicle),
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
            vehicles.map(toExportableVehicle),
            exportColumns(),
          )
        }
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

export function VehiclesPage() {
  const [showForm, setShowForm] = useState(false);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("vehicle:create");
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
          <div className="flex items-center gap-2">
            <ExportVehiclesButton />
            {canCreate && (
              <Button onClick={() => setShowForm(true)} size="sm">
                <Plus className="size-4" />
                Add vehicle
              </Button>
            )}
          </div>
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
