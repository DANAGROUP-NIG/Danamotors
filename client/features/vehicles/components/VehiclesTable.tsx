"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Download,
  Share2,
  Mail,
  MessageCircle,
  Link2,
  Trash2,
  Eye,
  FileSpreadsheet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import ModalFame from "@/components/modals/ModalFame";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import {
  DataTable,
  type Column,
} from "@/components/ui/table-components/DataTable";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
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
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useVehicles } from "../hooks/use-vehicles";
import { useBulkDeleteVehicles } from "../hooks/use-bulk-delete-vehicles";
import { VehicleEditForm } from "./VehicleEditForm";
import type { Vehicle } from "../types/vehicle.types";

const PAGE_SIZE = 10;

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

function formatVehicleText(v: Vehicle) {
  const customer = v.customer
    ? `${v.customer.firstName} ${v.customer.lastName}`
    : "N/A";
  return `*${v.make ?? ""} ${v.model ?? ""}*\nVIN: ${v.vin}\nRegistration: ${v.registrationNumber ?? "N/A"}\nCustomer: ${customer}\nYear: ${v.year ?? "N/A"}\nColor: ${v.color ?? "N/A"}\nOwnership: ${v.ownershipStatus ?? "N/A"}`;
}

export function VehiclesTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteCandidates, setDeleteCandidates] = useState<Vehicle[] | null>(null);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("vehicle:update");
  const canDelete = hasPermission("vehicle:delete");

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id]);

  const { data, isLoading, isError, isFetching } = useVehicles({
    page,
    limit: PAGE_SIZE,
    search: committedSearch || undefined,
    branchId: activeBranch?.id,
  });
  const vehicles = useMemo(() => data?.vehicles ?? [], [data?.vehicles]);
  const meta = data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  const selection = useDataTableSelection<Vehicle>({
    data: vehicles,
    rowKey: (v) => v.id,
  });

  const bulkDelete = useBulkDeleteVehicles();

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

  function exportSelected(items: Vehicle[]) {
    downloadCsv(
      `vehicles-${new Date().toISOString().split("T")[0]}`,
      items.map(toExportableVehicle),
      exportColumns(),
    );
  }

  function exportSelectedExcel(items: Vehicle[]) {
    downloadExcel(
      `vehicles-${new Date().toISOString().split("T")[0]}`,
      items.map(toExportableVehicle),
      exportColumns(),
    );
  }

  function shareSelected(items: Vehicle[]) {
    const text = items.map(formatVehicleText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Dana Motors Vehicles`,
      text,
    });
  }

  function emailSelected(items: Vehicle[]) {
    const body = items.map(formatVehicleText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} Vehicle${items.length === 1 ? "" : "s"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: Vehicle[]) {
    const message = items.map(formatVehicleText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  function confirmDeleteSelected(items: Vehicle[]) {
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

  const columns: Column<Vehicle>[] = [
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
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (v) => (
        <DataTableRowActions
          item={v}
          quickActions={[
            canEdit && {
              id: "edit",
              label: "Edit",
              icon: <Pencil className="size-3.5" />,
              onClick: () => setEditingId(v.id),
            },
          ]}
          actions={[
            {
              id: "view",
              label: "View details",
              icon: <Eye className="size-4" />,
              onClick: () => router.push(`/vehicles/${v.id}`),
            },
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([v]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: `${v.make ?? ""} ${v.model ?? ""}`.trim() || v.vin,
                  text: formatVehicleText(v),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Vehicle: ${v.make ?? ""} ${v.model ?? ""}`.trim() || v.vin,
                  body: formatVehicleText(v),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatVehicleText(v) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              shortcut: "⌘C",
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/vehicles/${v.id}`,
                  "Vehicle link copied",
                ),
            },
            canDelete && {
              id: "delete",
              label: "Delete",
              icon: <Trash2 className="size-4" />,
              destructive: true,
              onClick: () => setDeleteCandidates([v]),
            },
          ]}
        />
      ),
    },
  ];

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
        columns={columns}
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
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
        selection={selection}
      >
        <div className="flex flex-col gap-4">
          <DataTableToolbar
            search={search}
            onSearchChange={setSearch}
            onSearch={commitSearch}
            onClearSearch={clearSearch}
            placeholder="Search by make, model, VIN, reg no, or customer…"
            isLoading={isLoading}
            isFetching={isFetching}
          />

          <DataTableBulkToolbar
            selectedCount={selection.selectedIds.size}
            totalCount={total}
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
        </div>
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

      <ConfirmDeleteModal
        isOpen={!!deleteCandidates}
        onClose={() => setDeleteCandidates(null)}
        onConfirm={handleConfirmDelete}
        title={
          deleteCandidates && deleteCandidates.length > 1
            ? `Delete ${pluralize(deleteCandidates.length, "vehicle")}?`
            : "Delete vehicle?"
        }
        message={
          deleteCandidates && deleteCandidates.length > 1
            ? `This will permanently remove ${pluralize(deleteCandidates.length, "vehicle")}. This action cannot be undone.`
            : `This will permanently remove ${deleteCandidates?.[0] ? `${deleteCandidates[0].make ?? ""} ${deleteCandidates[0].model ?? ""}`.trim() || deleteCandidates[0].vin : "this vehicle"}. This action cannot be undone.`
        }
        isPending={bulkDelete.isPending}
      />
    </>
  );
}
