"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle, Download, Eye, FileSpreadsheet, Link2, Pencil, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import ModalFame from "@/components/modals/ModalFame";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { inputCls } from "@/components/forms/FormField";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import { copyToClipboard, downloadCsv, downloadExcel, pluralize } from "@/lib/table-actions";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { useParts } from "../hooks/use-parts";
import { useSetPartStatus } from "../hooks/use-part-mutations";
import { useBulkDeleteParts } from "../hooks/use-bulk-delete-inventory";
import { PartForm, PART_CATEGORIES } from "./PartForm";
import { PartRoleBadge, PartStatusBadge, fmtNaira } from "./PartStatusBadge";
import type { PartMaster, PartRole, PartStatus } from "../types/inventory.types";

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Blocked", value: "BLOCKED" },
];

export const PART_EXPORT_COLUMNS = [
  { key: "partNumber", label: "Part Number" },
  { key: "name", label: "Name" },
  { key: "category", label: "Category" },
  { key: "uom", label: "UOM" },
  { key: "taxCategory", label: "Tax Category" },
  { key: "taxForm", label: "Tax Form" },
  { key: "minLevel", label: "Min Level" },
  { key: "maxLevel", label: "Max Level" },
  { key: "reorderQty", label: "Reorder Qty" },
  { key: "partFlag", label: "Part Flag" },
  { key: "priceCategoryCode", label: "Price Category" },
  { key: "taxable", label: "Taxable" },
  { key: "unitRate", label: "Dealer Rate" },
  { key: "retailRate", label: "Retail Rate" },
  { key: "binLocation", label: "Bin Location" },
  { key: "storeLocation", label: "Store Location" },
  { key: "partStatus", label: "Status" },
  { key: "role", label: "Role" },
];

export function partExportRow(p: PartMaster): Record<string, string | number> {
  return {
    partNumber: p.partNumber,
    name: p.name,
    category: p.category ?? "",
    uom: p.uom,
    taxCategory: p.taxCategory ?? "",
    taxForm: p.taxForm ?? "",
    minLevel: p.minLevel ?? "",
    maxLevel: p.maxLevel ?? "",
    reorderQty: p.reorderQty ?? "",
    partFlag: p.partFlag,
    priceCategoryCode: p.priceCategoryCode ?? "",
    taxable: p.taxable ? "Yes" : "No",
    unitRate: p.unitRate,
    retailRate: p.retailRate ?? "",
    binLocation: p.binLocation ?? "",
    storeLocation: p.storeLocation ?? "",
    partStatus: p.partStatus,
    role: p.role,
  };
}

/** Part Master list with server-side search, filters and pagination. */
export function PartMasterTable() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<PartMaster | null>(null);
  const [deleting, setDeleting] = useState<PartMaster[] | null>(null);
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(INVENTORY_PERMISSIONS.SPAREPART_UPDATE);
  const canDelete = hasPermission(INVENTORY_PERMISSIONS.SPAREPART_DELETE);
  const setPartStatus = useSetPartStatus();
  const bulkDelete = useBulkDeleteParts();

  const { data, isLoading, isFetching, isError } = useParts({
    search: committedSearch || undefined,
    partStatus: (status || undefined) as PartStatus | undefined,
    role: (role || undefined) as PartRole | undefined,
    category: category || undefined,
    page,
    limit: PAGE_SIZE,
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selection = useDataTableSelection<PartMaster>({ data: items, rowKey: (p) => p.id });

  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  function exportParts(list: PartMaster[], format: "csv" | "excel") {
    const filename = `part-master-${new Date().toISOString().split("T")[0]}`;
    const rows = list.map(partExportRow);
    if (format === "csv") downloadCsv(filename, rows, PART_EXPORT_COLUMNS);
    else downloadExcel(filename, rows, PART_EXPORT_COLUMNS);
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-red-500">Failed to load parts. Check the API connection and try again.</p>
        </CardContent>
      </Card>
    );
  }

  const columns: Column<PartMaster>[] = [
    {
      header: "Part",
      className: "min-w-44",
      render: (p) => (
        <Link href={`/inventory/${p.id}`} className="block hover:underline">
          <p className="font-medium">{p.name}</p>
          <p className="font-mono text-sm text-muted-foreground">{p.partNumber}</p>
        </Link>
      ),
    },
    {
      header: "Part code",
      render: (p) => <span className="font-mono text-sm text-muted-foreground">{p.partCode}</span>,
    },
    {
      header: "Category",
      render: (p) => (
        <span className="text-muted-foreground">
          {p.category || "—"}
          {p.priceCategoryCode && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{p.priceCategoryCode}</span>}
        </span>
      ),
    },
    { header: "UOM", render: (p) => <span className="text-muted-foreground">{p.uom}</span> },
    {
      header: "Dealer / Retail",
      render: (p) => (
        <span className="text-muted-foreground">
          {fmtNaira(p.unitRate)}
          <span className="block text-sm">{p.retailRate != null ? fmtNaira(p.retailRate) : "—"}</span>
        </span>
      ),
    },
    {
      header: "Min / Max",
      render: (p) => (
        <span className="text-muted-foreground">
          {p.minLevel ?? "—"} / {p.maxLevel ?? "—"}
        </span>
      ),
    },
    {
      header: "Location",
      render: (p) => (
        <span className="text-muted-foreground">
          {[p.binLocation, p.storeLocation].filter(Boolean).join(" · ") || "—"}
        </span>
      ),
    },
    { header: "Role", render: (p) => <PartRoleBadge role={p.role} /> },
    { header: "Status", render: (p) => <PartStatusBadge status={p.partStatus} /> },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (p) => (
        <DataTableRowActions
          item={p}
          quickActions={[
            canEdit && {
              id: "edit",
              label: "Edit",
              icon: <Pencil className="size-3.5" />,
              onClick: () => setEditing(p),
            },
          ]}
          actions={[
            { id: "view", label: "View details", icon: <Eye className="size-4" />, onClick: () => router.push(`/inventory/${p.id}`) },
            canEdit &&
              (p.partStatus === "ACTIVE"
                ? {
                    id: "block",
                    label: "Block part",
                    icon: <Ban className="size-4" />,
                    disabled: setPartStatus.isPending,
                    onClick: () => setPartStatus.mutate({ id: p.id, partStatus: "BLOCKED" }),
                  }
                : {
                    id: "activate",
                    label: "Activate part",
                    icon: <CheckCircle className="size-4" />,
                    disabled: setPartStatus.isPending,
                    onClick: () => setPartStatus.mutate({ id: p.id, partStatus: "ACTIVE" }),
                  }),
            { id: "download", label: "Download CSV", icon: <Download className="size-4" />, onClick: () => exportParts([p], "csv") },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              onClick: () => copyToClipboard(`${window.location.origin}/inventory/${p.id}`, "Part link copied"),
            },
            canDelete && {
              id: "delete",
              label: "Delete",
              icon: <Trash2 className="size-4" />,
              destructive: true,
              onClick: () => setDeleting([p]),
            },
          ]}
        />
      ),
    },
  ];

  const filtersActive = !!(status || role || category);

  return (
    <div className="grid gap-4">
      <DataTable<PartMaster>
        columns={columns}
        data={items}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          committedSearch || filtersActive ? "No parts match your search or filters." : "No parts yet. Add one to get started."
        }
        rowKey={(p) => p.id}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
        selection={selection}
      >
        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          onSearch={() => {
            setCommittedSearch(search.trim());
            setPage(1);
          }}
          onClearSearch={() => {
            setSearch("");
            setCommittedSearch("");
            setPage(1);
          }}
          placeholder="Search by part number or name…"
          filters={
            <div className="flex flex-wrap items-center gap-3">
              <DataTableFilterChips options={STATUS_OPTIONS} selected={status} onChange={resetPage(setStatus)} />
              <select
                className={cn(inputCls, "h-9 w-auto")}
                value={role}
                onChange={(e) => resetPage(setRole)(e.target.value)}
                aria-label="Filter by role"
              >
                <option value="">Main and alternate</option>
                <option value="MAIN">Main parts</option>
                <option value="ALTERNATE">Alternate parts</option>
              </select>
              <select
                className={cn(inputCls, "h-9 w-auto")}
                value={category}
                onChange={(e) => resetPage(setCategory)(e.target.value)}
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {PART_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {filtersActive && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setStatus("");
                    setRole("");
                    setCategory("");
                    setPage(1);
                  }}
                >
                  <X className="size-3.5" /> Clear filters
                </button>
              )}
            </div>
          }
        />

        <DataTableBulkToolbar
          selectedCount={selection.selectedIds.size}
          totalCount={total}
          selectedItems={selection.selectedItems}
          onClear={selection.clear}
          actions={[
            { id: "export", label: "CSV", icon: <Download className="size-3.5" />, variant: "ghost", onClick: (l) => exportParts(l, "csv") },
            { id: "excel", label: "Excel", icon: <FileSpreadsheet className="size-3.5" />, variant: "ghost", onClick: (l) => exportParts(l, "excel") },
            canDelete && {
              id: "delete",
              label: "Delete",
              icon: <Trash2 className="size-3.5" />,
              variant: "destructive",
              onClick: (l) => setDeleting(l),
            },
          ]}
        />
      </DataTable>

      <ModalFame isOpen={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.partNumber ?? "part"}`}>
        {editing && <PartForm part={editing} onSuccess={() => setEditing(null)} />}
      </ModalFame>

      <ConfirmDeleteModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          bulkDelete.mutate(
            deleting.map((p) => p.id),
            {
              onSuccess: () => {
                setDeleting(null);
                selection.clear();
              },
            },
          )
        }
        title={deleting && deleting.length > 1 ? `Delete ${pluralize(deleting.length, "part")}?` : "Delete part?"}
        message={
          deleting && deleting.length > 1
            ? `This permanently removes ${pluralize(deleting.length, "part")} from Part Master. Parts that are in use cannot be deleted; block them instead.`
            : `This permanently removes ${deleting?.[0]?.partNumber ?? "this part"} from Part Master. A part that is in use cannot be deleted; block it instead.`
        }
        isPending={bulkDelete.isPending}
      />
    </div>
  );
}
