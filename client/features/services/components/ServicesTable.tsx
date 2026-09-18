"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Pencil,
  Download,
  Share2,
  Mail,
  MessageCircle,
  Link2,
  Trash2,
  Copy,
  FileSpreadsheet,
  Check,
  X,
  Eye,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
import { useServices } from "../hooks/use-services";
import { useBulkDeleteServices } from "../hooks/use-bulk-delete-services";
import { useBulkUpdateServices } from "../hooks/use-bulk-update-services";
import { ServiceEditForm } from "./ServiceEditForm";
import { ServiceCreateForm } from "./ServiceCreateForm";
import type { ServiceItem } from "../types/service-catalog.types";
import { useAuth } from "@/features/auth/hooks/use-auth";

const PAGE_SIZE = 10;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(amount);
}

function formatServiceText(service: ServiceItem) {
  return `*${service.name}*\nCategory: ${service.category ?? "N/A"}\nDuration: ${service.durationMins ?? "—"} min\nPrice: ${formatCurrency(service.price)}\nStatus: ${service.isActive ? "Active" : "Inactive"}`;
}

function exportColumns() {
  return [
    { key: "name", label: "Name" },
    { key: "category", label: "Category" },
    { key: "durationMins", label: "Duration (mins)" },
    { key: "price", label: "Price" },
    { key: "appointmentsCount", label: "Bookings" },
    { key: "isActive", label: "Active" },
  ];
}

export function ServicesTable() {
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<ServiceItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [deleteCandidates, setDeleteCandidates] = useState<ServiceItem[] | null>(null);

  const { hasPermission } = useAuth();
  const canEdit = hasPermission("services:update");
  const canDelete = hasPermission("services:delete");

  const { data, isLoading, isError, isFetching } = useServices({
    page,
    limit: PAGE_SIZE,
    search: committedSearch || undefined,
    category: categoryFilter || undefined,
    isActive: statusFilter === "" ? undefined : statusFilter === "active",
  });
  const services = useMemo(() => data?.services ?? [], [data?.services]);
  const meta = data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  const selection = useDataTableSelection<ServiceItem>({
    data: services,
    rowKey: (s) => s.id,
  });

  const bulkDelete = useBulkDeleteServices();
  const bulkUpdate = useBulkUpdateServices();

  const categories = useMemo(
    () => Array.from(new Set(services.map((s) => s.category).filter(Boolean))),
    [services],
  );

  const editingService = services.find((s) => s.id === editingId) ?? null;

  function commitSearch() {
    setPage(1);
    setCommittedSearch(search);
  }
  function clearSearch() {
    setSearch("");
    setCommittedSearch("");
    setPage(1);
  }

  function exportSelected(items: ServiceItem[]) {
    downloadCsv(
      `services-${new Date().toISOString().split("T")[0]}`,
      items as unknown as Record<string, string | number | boolean | null | undefined>[],
      exportColumns(),
    );
  }

  function exportSelectedExcel(items: ServiceItem[]) {
    downloadExcel(
      `services-${new Date().toISOString().split("T")[0]}`,
      items as unknown as Record<string, string | number | boolean | null | undefined>[],
      exportColumns(),
    );
  }

  function shareSelected(items: ServiceItem[]) {
    const text = items.map(formatServiceText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Dana Motors Services`,
      text,
    });
  }

  function emailSelected(items: ServiceItem[]) {
    const body = items.map(formatServiceText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} Service${items.length === 1 ? "" : "s"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: ServiceItem[]) {
    const message = items.map(formatServiceText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  function activateSelected(items: ServiceItem[]) {
    bulkUpdate.mutate({
      services: items.filter((s) => !s.isActive),
      payload: { isActive: true },
      label: "activated",
    });
    selection.clear();
  }

  function deactivateSelected(items: ServiceItem[]) {
    bulkUpdate.mutate({
      services: items.filter((s) => s.isActive),
      payload: { isActive: false },
      label: "deactivated",
    });
    selection.clear();
  }

  function confirmDeleteSelected(items: ServiceItem[]) {
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

  const columns: Column<ServiceItem>[] = [
    {
      header: "Name",
      render: (s) => (
        <div className="flex flex-col">
          <span className="font-medium">{s.name}</span>
          {s.description && (
            <span className="line-clamp-1 max-w-xs text-xs text-muted-foreground">
              {s.description}
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Category",
      render: (s) => (
        <span className="text-muted-foreground">
          {s.category ?? <span className="text-border">—</span>}
        </span>
      ),
    },
    {
      header: "Duration",
      render: (s) => (
        <span className="text-muted-foreground">
          {s.durationMins != null ? `${s.durationMins} min` : "—"}
        </span>
      ),
    },
    {
      header: "Price",
      render: (s) => <span className="font-medium">{formatCurrency(s.price)}</span>,
    },
    {
      header: "Bookings",
      render: (s) => (
        <span className="text-muted-foreground">{s.appointmentsCount ?? 0}</span>
      ),
    },
    {
      header: "Status",
      render: (s) => (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            s.isActive
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
              : "bg-red-50 text-red-700 ring-1 ring-red-600/20",
          )}
        >
          {s.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (s) => (
        <DataTableRowActions
          item={s}
          quickActions={[
            canEdit && {
              id: "edit",
              label: "Edit",
              icon: <Pencil className="size-3.5" />,
              onClick: () => setEditingId(s.id),
            },
          ]}
          actions={[
            {
              id: "view",
              label: "View details",
              icon: <Eye className="size-4" />,
              onClick: () => setEditingId(s.id),
            },
            canEdit && {
              id: "duplicate",
              label: "Duplicate",
              icon: <Copy className="size-4" />,
              onClick: () => setDuplicating(s),
            },
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([s]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: s.name,
                  text: formatServiceText(s),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Service: ${s.name}`,
                  body: formatServiceText(s),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatServiceText(s) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              shortcut: "⌘C",
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/services/${s.id}`,
                  "Service link copied",
                ),
            },
            canEdit &&
              (s.isActive
                ? {
                    id: "deactivate",
                    label: "Deactivate",
                    icon: <X className="size-4" />,
                    onClick: () =>
                      bulkUpdate.mutate({
                        services: [s],
                        payload: { isActive: false },
                        label: "deactivated",
                      }),
                  }
                : {
                    id: "activate",
                    label: "Activate",
                    icon: <Check className="size-4" />,
                    onClick: () =>
                      bulkUpdate.mutate({
                        services: [s],
                        payload: { isActive: true },
                        label: "activated",
                      }),
                  }),
            canDelete && {
              id: "delete",
              label: "Delete",
              icon: <Trash2 className="size-4" />,
              destructive: true,
              onClick: () => setDeleteCandidates([s]),
            },
          ]}
        />
      ),
    },
  ];

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      {categories.length > 0 && (
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c!}>
              {c}
            </option>
          ))}
        </select>
      )}
      <select
        value={statusFilter}
        onChange={(e) => {
          setStatusFilter(e.target.value as "" | "active" | "inactive");
          setPage(1);
        }}
        className="h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      {(categoryFilter || statusFilter) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setCategoryFilter("");
            setStatusFilter("");
            setPage(1);
          }}
          className="h-9 text-muted-foreground hover:text-foreground"
        >
          <X className="mr-1 size-3.5" />
          Clear filters
        </Button>
      )}
    </div>
  );

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-red-500">
            Failed to load services. Check the API connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={services}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          committedSearch || categoryFilter || statusFilter
            ? "No services match your filters."
            : "No services yet. Add one above."
        }
        rowKey={(s) => s.id}
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
            placeholder="Search services…"
            isLoading={isLoading}
            isFetching={isFetching}
            filters={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters((v) => !v)}
                className={cn(
                  "h-9 gap-1.5 transition-colors",
                  showFilters && "border-primary/30 bg-primary/5 text-primary",
                )}
              >
                <Filter className="size-3.5" />
                Filters
              </Button>
            }
          />

          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              {filters}
            </motion.div>
          )}

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
              canEdit && {
                id: "activate",
                label: "Activate",
                icon: <Check className="size-3.5" />,
                variant: "outline",
                onClick: activateSelected,
              },
              canEdit && {
                id: "deactivate",
                label: "Deactivate",
                icon: <X className="size-3.5" />,
                variant: "outline",
                onClick: deactivateSelected,
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

      <ModalFame
        isOpen={!!editingId}
        onClose={() => setEditingId(null)}
        title="Edit service"
      >
        {editingService && (
          <ServiceEditForm
            service={editingService}
            onSuccess={() => setEditingId(null)}
          />
        )}
      </ModalFame>

      <ModalFame
        isOpen={!!duplicating}
        onClose={() => setDuplicating(null)}
        title="Duplicate service"
      >
        {duplicating && (
          <ServiceCreateForm
            defaultValues={{
              name: duplicating.name,
              description: duplicating.description ?? undefined,
              category: duplicating.category ?? undefined,
              durationMins:
                duplicating.durationMins != null
                  ? String(duplicating.durationMins)
                  : undefined,
              price: String(duplicating.price),
              isActive: duplicating.isActive,
            }}
            onSuccess={() => setDuplicating(null)}
          />
        )}
      </ModalFame>

      <ConfirmDeleteModal
        isOpen={!!deleteCandidates}
        onClose={() => setDeleteCandidates(null)}
        onConfirm={handleConfirmDelete}
        title={
          deleteCandidates && deleteCandidates.length > 1
            ? `Delete ${pluralize(deleteCandidates.length, "service")}?`
            : "Delete service?"
        }
        message={
          deleteCandidates && deleteCandidates.length > 1
            ? `This will permanently remove ${pluralize(deleteCandidates.length, "service")}. Past bookings will keep their records but will no longer reference these services. This cannot be undone.`
            : `This will permanently remove ${deleteCandidates?.[0]?.name ?? "this service"}. Past bookings will keep their records but will no longer reference this service. This cannot be undone.`
        }
        isPending={bulkDelete.isPending}
      />
    </>
  );
}
