"use client";

import { useMemo, useState } from "react";
import {
  Pencil,
  Download,
  Share2,
  Mail,
  MessageCircle,
  Link2,
  Trash2,
  Check,
  X,
  Eye,
  FileSpreadsheet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ModalFame from "@/components/modals/ModalFame";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
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
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranches } from "../hooks/use-branches";
import { useUpdateBranch } from "../hooks/use-update-branch";
import { useBulkUpdateBranches } from "../hooks/use-bulk-update-branches";
import { useBulkDeleteBranches } from "../hooks/use-bulk-delete-branches";
import { BranchEditForm } from "./BranchEditForm";
import type { Branch } from "../types/branch.types";

const PAGE_SIZE = 10;

function formatBranchText(branch: Branch) {
  return `*${branch.name}*\nCity: ${branch.city ?? "N/A"}\nState: ${branch.state ?? "N/A"}\nPhone: ${branch.phoneNumber ?? "N/A"}\nEmail: ${branch.email ?? "N/A"}\nStatus: ${branch.isActive ? "Active" : "Inactive"}`;
}

function exportColumns() {
  return [
    { key: "name", label: "Name" },
    { key: "city", label: "City" },
    { key: "state", label: "State" },
    { key: "phoneNumber", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "usersCount", label: "Users" },
    { key: "isActive", label: "Active" },
  ];
}

function BranchRowActions({
  branch,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  branch: Branch;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (id: string) => void;
  onDelete: (branch: Branch) => void;
}) {
  const updateBranch = useUpdateBranch(branch.id);

  return (
    <DataTableRowActions
      item={branch}
      quickActions={[
        canEdit && {
          id: "edit",
          label: "Edit",
          icon: <Pencil className="size-3.5" />,
          onClick: () => onEdit(branch.id),
        },
      ]}
      actions={[
        {
          id: "view",
          label: "View details",
          icon: <Eye className="size-4" />,
          onClick: () => onEdit(branch.id),
        },
        {
          id: "download",
          label: "Download CSV",
          icon: <Download className="size-4" />,
          onClick: () =>
            downloadCsv(
              `branch-${branch.id}-${new Date().toISOString().split("T")[0]}`,
              [branch] as unknown as Record<string, string | number | boolean | null | undefined>[],
              exportColumns(),
            ),
        },
        {
          id: "share",
          label: "Share",
          icon: <Share2 className="size-4" />,
          onClick: () =>
            shareItems({
              title: branch.name,
              text: formatBranchText(branch),
            }),
        },
        {
          id: "email",
          label: "Email",
          icon: <Mail className="size-4" />,
          onClick: () =>
            openMailto({
              subject: `Branch: ${branch.name}`,
              body: formatBranchText(branch),
            }),
        },
        {
          id: "whatsapp",
          label: "WhatsApp",
          icon: <MessageCircle className="size-4" />,
          onClick: () => openWhatsApp({ message: formatBranchText(branch) }),
        },
        {
          id: "copy-link",
          label: "Copy link",
          icon: <Link2 className="size-4" />,
          shortcut: "⌘C",
          onClick: () =>
            copyToClipboard(
              `${window.location.origin}/branches/${branch.id}`,
              "Branch link copied",
            ),
        },
        canEdit &&
          (branch.isActive
            ? {
                id: "deactivate",
                label: "Deactivate",
                icon: <X className="size-4" />,
                onClick: () => updateBranch.mutate({ isActive: false }),
              }
            : {
                id: "activate",
                label: "Activate",
                icon: <Check className="size-4" />,
                onClick: () => updateBranch.mutate({ isActive: true }),
              }),
        canDelete && {
          id: "delete",
          label: "Delete",
          icon: <Trash2 className="size-4" />,
          destructive: true,
          onClick: () => onDelete(branch),
        },
      ]}
    />
  );
}

export function BranchesTable() {
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteCandidates, setDeleteCandidates] = useState<Branch[] | null>(null);

  const { hasPermission } = useAuth();
  const canEdit = hasPermission("branch:update");
  const canDelete = hasPermission("branch:delete");

  const { data, isLoading, isError, isFetching } = useBranches({
    page,
    limit: PAGE_SIZE,
    search: committedSearch || undefined,
  });
  const branches = useMemo(() => data?.branches ?? [], [data?.branches]);
  const meta = data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  const selection = useDataTableSelection<Branch>({
    data: branches,
    rowKey: (b) => b.id,
  });

  const bulkUpdate = useBulkUpdateBranches();
  const bulkDelete = useBulkDeleteBranches();

  const editingBranch = branches.find((b) => b.id === editingId) ?? null;

  function commitSearch() {
    setPage(1);
    setCommittedSearch(search);
  }
  function clearSearch() {
    setSearch("");
    setCommittedSearch("");
    setPage(1);
  }

  function exportSelected(items: Branch[]) {
    downloadCsv(
      `branches-${new Date().toISOString().split("T")[0]}`,
      items as unknown as Record<string, string | number | boolean | null | undefined>[],
      exportColumns(),
    );
  }

  function exportSelectedExcel(items: Branch[]) {
    downloadExcel(
      `branches-${new Date().toISOString().split("T")[0]}`,
      items as unknown as Record<string, string | number | boolean | null | undefined>[],
      exportColumns(),
    );
  }

  function shareSelected(items: Branch[]) {
    const text = items.map(formatBranchText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Dana Motors Branches`,
      text,
    });
  }

  function emailSelected(items: Branch[]) {
    const body = items.map(formatBranchText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} Branch${items.length === 1 ? "" : "es"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: Branch[]) {
    const message = items.map(formatBranchText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  function activateSelected(items: Branch[]) {
    bulkUpdate.mutate({
      branches: items.filter((b) => !b.isActive),
      payload: { isActive: true },
      label: "activated",
    });
    selection.clear();
  }

  function deactivateSelected(items: Branch[]) {
    bulkUpdate.mutate({
      branches: items.filter((b) => b.isActive),
      payload: { isActive: false },
      label: "deactivated",
    });
    selection.clear();
  }

  function confirmDeleteSelected(items: Branch[]) {
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

  const columns: Column<Branch>[] = [
    {
      header: "Name",
      render: (b) => <span className="font-medium">{b.name}</span>,
    },
    {
      header: "City",
      render: (b) => (
        <span className="text-muted-foreground">
          {b.city ?? <span className="text-border">—</span>}
        </span>
      ),
    },
    {
      header: "State",
      render: (b) => (
        <span className="text-muted-foreground">
          {b.state ?? <span className="text-border">—</span>}
        </span>
      ),
    },
    {
      header: "Phone",
      render: (b) => (
        <span className="text-muted-foreground">
          {b.phoneNumber ?? <span className="text-border">—</span>}
        </span>
      ),
    },
    {
      header: "Email",
      render: (b) => (
        <span className="text-muted-foreground">
          {b.email ?? <span className="text-border">—</span>}
        </span>
      ),
    },
    {
      header: "Users",
      render: (b) => <span className="text-muted-foreground">{b.usersCount}</span>,
    },
    {
      header: "Status",
      render: (b) => (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            b.isActive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700",
          )}
        >
          {b.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (b) => (
        <BranchRowActions
          branch={b}
          canEdit={canEdit}
          canDelete={canDelete}
          onEdit={setEditingId}
          onDelete={(branch) => setDeleteCandidates([branch])}
        />
      ),
    },
  ];

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-red-500">
            Failed to load branches. Check the API connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={branches}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          committedSearch
            ? `No branches matching "${committedSearch}"`
            : "No branches yet. Add one above."
        }
        rowKey={(b) => b.id}
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
            placeholder="Search by name, city, or state…"
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
        title="Edit branch"
      >
        {editingBranch && (
          <BranchEditForm
            branch={editingBranch}
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
            ? `Delete ${pluralize(deleteCandidates.length, "branch")}?`
            : "Delete branch?"
        }
        message={
          deleteCandidates && deleteCandidates.length > 1
            ? `This will permanently remove ${pluralize(deleteCandidates.length, "branch")}. All users, appointments, and job cards in these branches will be permanently deleted. This action cannot be undone.`
            : `This will permanently remove ${deleteCandidates?.[0]?.name ?? "this branch"}. All users, appointments, and job cards in this branch will be permanently deleted. This action cannot be undone.`
        }
        isPending={bulkDelete.isPending}
      />
    </>
  );
}
