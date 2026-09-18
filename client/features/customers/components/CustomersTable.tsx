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
  FileSpreadsheet,
  Eye,
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
import { useCustomers } from "../hooks/use-customers";
import { useBulkDeleteCustomers } from "../hooks/use-bulk-delete-customers";
import { getCustomerInitials } from "../services/customer.service";
import { CustomerEditForm } from "./CustomerEditForm";
import type { Customer } from "../types/customer.types";

const PAGE_SIZE = 10;

function formatCustomerText(c: Customer) {
  return `*${c.firstName} ${c.lastName}*\nEmail: ${c.email}\nPhone: ${c.phoneNumber ?? "N/A"}\nAddress: ${c.address ?? "N/A"}`;
}

function exportColumns() {
  return [
    { key: "firstName", label: "First Name" },
    { key: "lastName", label: "Last Name" },
    { key: "email", label: "Email" },
    { key: "phoneNumber", label: "Phone" },
    { key: "address", label: "Address" },
    { key: "city", label: "City" },
    { key: "state", label: "State" },
    { key: "country", label: "Country" },
  ];
}

export function CustomersTable() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteCandidates, setDeleteCandidates] = useState<Customer[] | null>(null);

  const router = useRouter();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("customer:update");
  const canDelete = hasPermission("customer:delete");

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id]);

  const { data, isLoading, isError, isFetching } = useCustomers({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    branchId: activeBranch?.id,
  });

  const customers = useMemo(() => data?.customers ?? [], [data?.customers]);
  const meta = data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selection = useDataTableSelection<Customer>({
    data: customers,
    rowKey: (c) => c.id,
  });

  const bulkDelete = useBulkDeleteCustomers();

  const editingCustomer = customers.find((c) => c.id === editingId) ?? null;

  function commitSearch() {
    setPage(1);
    setDebouncedSearch(search);
  }

  function clearSearch() {
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  }

  function exportSelected(items: Customer[]) {
    downloadCsv(
      `customers-${new Date().toISOString().split("T")[0]}`,
      items as unknown as Record<string, string | number | boolean | null | undefined>[],
      exportColumns(),
    );
  }

  function exportSelectedExcel(items: Customer[]) {
    downloadExcel(
      `customers-${new Date().toISOString().split("T")[0]}`,
      items as unknown as Record<string, string | number | boolean | null | undefined>[],
      exportColumns(),
    );
  }

  function shareSelected(items: Customer[]) {
    const text = items.map(formatCustomerText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Dana Motors Customers`,
      text,
    });
  }

  function emailSelected(items: Customer[]) {
    const body = items.map(formatCustomerText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} Customer${items.length === 1 ? "" : "s"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: Customer[]) {
    const message = items.map(formatCustomerText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  function confirmDeleteSelected(items: Customer[]) {
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

  const columns: Column<Customer>[] = [
    {
      header: "Customer",
      render: (c) => (
        <div className="flex items-center gap-3">
          <span className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-black text-primary">
            {getCustomerInitials(c)}
          </span>
          <span className="font-medium">
            {c.firstName} {c.lastName}
          </span>
        </div>
      ),
    },
    {
      header: "Email",
      render: (c) => <span className="text-muted-foreground">{c.email}</span>,
    },
    {
      header: "Phone",
      render: (c) => (
        <span className="text-muted-foreground">
          {c.phoneNumber ?? <span className="text-border">—</span>}
        </span>
      ),
    },
    {
      header: "Address",
      render: (c) => (
        <span className="text-muted-foreground">
          {c.address ?? <span className="text-border">—</span>}
        </span>
      ),
    },
    {
      header: "Agent",
      render: (c) => (
        <span className="text-muted-foreground">
          {c.createdBy ? c.createdBy.firstName : <span className="text-border">—</span>}
        </span>
      ),
    },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (c) => (
        <DataTableRowActions
          item={c}
          quickActions={[
            canEdit && {
              id: "edit",
              label: "Edit",
              icon: <Pencil className="size-3.5" />,
              onClick: () => setEditingId(c.id),
            },
          ]}
          actions={[
            {
              id: "view",
              label: "View details",
              icon: <Eye className="size-4" />,
              onClick: () => router.push(`/customers/${c.id}`),
            },
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([c]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: `${c.firstName} ${c.lastName}`,
                  text: formatCustomerText(c),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Customer: ${c.firstName} ${c.lastName}`,
                  body: formatCustomerText(c),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatCustomerText(c) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              shortcut: "⌘C",
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/customers/${c.id}`,
                  "Customer link copied",
                ),
            },
            canDelete && {
              id: "delete",
              label: "Delete",
              icon: <Trash2 className="size-4" />,
              destructive: true,
              onClick: () => setDeleteCandidates([c]),
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
            Failed to load customers. Check the API connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={customers}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          debouncedSearch
            ? `No customers matching "${debouncedSearch}"`
            : "No customers yet. Add one above."
        }
        rowKey={(c) => c.id}
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
            placeholder="Search by name, email, or phone…"
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

      <ModalFame
        isOpen={!!editingId}
        onClose={() => setEditingId(null)}
        title="Edit customer"
      >
        {editingCustomer && (
          <CustomerEditForm
            customer={editingCustomer}
            onSuccess={() => setEditingId(null)}
          />
        )}
      </ModalFame>

      <ConfirmDeleteModal
        isOpen={!!deleteCandidates}
        onClose={() => setDeleteCandidates(null)}
        onConfirm={handleConfirmDelete}
        title={
          deleteCandidates && deleteCandidates.length > 1
            ? `Delete ${pluralize(deleteCandidates.length, "customer")}?`
            : "Delete customer?"
        }
        message={
          deleteCandidates && deleteCandidates.length > 1
            ? `This will permanently remove ${pluralize(deleteCandidates.length, "customer")}. This cannot be undone.`
            : `Are you sure you want to delete ${deleteCandidates?.[0]?.firstName ?? ""} ${deleteCandidates?.[0]?.lastName ?? "this customer"}? This action cannot be undone.`
        }
        isPending={bulkDelete.isPending}
      />
    </>
  );
}
