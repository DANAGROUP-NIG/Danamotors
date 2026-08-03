"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ModalFame from "@/components/modals/ModalFame";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DELETE_ROLES, VEHICLE_UPDATE_ROLES } from "@/features/auth/roles";
import { useVehicles } from "../hooks/use-vehicles";
import { VehicleDeleteButton } from "./VehicleDeleteButton";
import { VehicleEditForm } from "./VehicleEditForm";

import { DataTable } from "@/components/ui/table-components/DataTable";
import { DataTableSearchHeader } from "@/components/ui/table-components/DataTableSearchHeader";

const PAGE_SIZE = 10;

export function VehiclesTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canDelete = hasAccess(DELETE_ROLES);
  const canEdit = hasAccess(VEHICLE_UPDATE_ROLES);
  const canManage = canEdit || canDelete;

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id]);

  const { data, isLoading, isError, isFetching } = useVehicles({
    page,
    limit: PAGE_SIZE,
    search: committedSearch || undefined,
    branchId: activeBranch?.id,
  });
  const vehicles = data?.vehicles ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  const editingVehicle = vehicles.find((v) => v.id === editingId) ?? null;

  function commitSearch() {
    setPage(1);
    setCommittedSearch(search);
  }
  function clearSearch() {
    setSearch("");
    setCommittedSearch("");
    setPage(1);
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-red-500">
            Failed to load vehicles. Check the API connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <DataTable
        columns={[
          {
            header: "Vehicle",
            render: (v) => (
              <span className="font-medium">
                {v.make ?? "—"} {v.model ?? ""}
              </span>
            ),
          },
          {
            header: "VIN",
            render: (v) => v.vin,
            className: "font-mono text-xs text-muted-foreground",
          },
          {
            header: "Reg No",
            render: (v) =>
              v.registrationNumber ?? <span className="text-border">—</span>,
            className: "text-muted-foreground",
          },
          {
            header: "Customer",
            render: (v) =>
              v.customer
                ? `${v.customer.firstName} ${v.customer.lastName}`
                : "—",
            className: "text-muted-foreground",
          },
          {
            header: "Year",
            render: (v) =>
              v.year ?? <span className="text-border">—</span>,
            className: "text-muted-foreground",
          },
          {
            header: "Color",
            render: (v) =>
              v.color ?? <span className="text-border">—</span>,
            className: "text-muted-foreground",
          },
          {
            header: "Ownership",
            render: (v) =>
              v.ownershipStatus ?? <span className="text-border">—</span>,
            className: "text-muted-foreground",
          },
          {
            header: "Agent",
            render: (v) =>
              v.createdBy ? v.createdBy.firstName : <span className="text-border">—</span>,
            className: "text-muted-foreground",
          },
          ...(canManage
            ? [
                {
                  header: "Actions",
                  render: (v: (typeof vehicles)[number]) => (
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          aria-label={`Edit ${v.make} ${v.model}`}
                          onClick={() => setEditingId(v.id)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {canDelete && <VehicleDeleteButton vehicle={v} />}
                    </div>
                  ),
                  headerClassName: "text-right",
                  className: "text-right",
                },
              ]
            : []),
        ]}
        data={vehicles}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          committedSearch
            ? `No vehicles matching "${committedSearch}"`
            : "No vehicles yet."
        }
        searchQuery={committedSearch}
        rowKey={(v) => v.id}
        onRowClick={(v) => router.push(`/vehicles/${v.id}`)}
        page={page}
        pageSize={PAGE_SIZE}
        total={meta?.total ?? 0}
        totalPages={totalPages}
        onPageChange={setPage}
      >
        <DataTableSearchHeader
          search={search}
          onSearchChange={setSearch}
          onCommitSearch={commitSearch}
          onClearSearch={clearSearch}
          placeholder="Search by make, model, VIN, reg no, or customer…"
          isLoading={isLoading}
          isFetching={isFetching}
        />
      </DataTable>

      {canEdit && (
        <ModalFame
          isOpen={!!editingId}
          onClose={() => setEditingId(null)}
          title="Edit vehicle"
        >
          {editingVehicle && (
            <VehicleEditForm
              vehicle={editingVehicle}
              onSuccess={() => setEditingId(null)}
            />
          )}
        </ModalFame>
      )}
    </>
  );
}
