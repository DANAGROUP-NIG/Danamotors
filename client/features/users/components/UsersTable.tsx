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
  Check,
  X,
  Eye,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ModalFame from "@/components/modals/ModalFame";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
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
import { useUsers } from "../hooks/use-users";
import { useRoles } from "../hooks/use-roles";
import { useBulkUpdateUsers } from "../hooks/use-bulk-update-users";
import { useBulkDeleteUsers } from "../hooks/use-bulk-delete-users";
import { getUserInitials, getUserFullName } from "../services/user.service";
import { UserEditForm } from "./UserEditForm";
import type { User } from "../types/user.types";

const PAGE_SIZE = 10;

function exportColumns() {
  return [
    { key: "firstName", label: "First Name" },
    { key: "lastName", label: "Last Name" },
    { key: "email", label: "Email" },
    { key: "phoneNumber", label: "Phone" },
    { key: "role", label: "Role" },
    { key: "branch", label: "Branch" },
    { key: "isActive", label: "Active" },
  ];
}

function formatUserText(user: User) {
  const name = getUserFullName(user);
  const role = user.role?.name ?? "N/A";
  const branch = user.branch?.name ?? "N/A";
  const phone = user.phoneNumber ?? "N/A";
  return `*${name}*\nEmail: ${user.email}\nRole: ${role}\nBranch: ${branch}\nPhone: ${phone}\nStatus: ${user.isActive ? "Active" : "Inactive"}`;
}

function exportRows(users: User[]) {
  return users.map((u) => ({
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phoneNumber: u.phoneNumber ?? "",
    role: u.role?.name ?? "",
    branch: u.branch?.name ?? "",
    isActive: u.isActive ? "Yes" : "No",
  }));
}

export function UsersTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [deleteCandidates, setDeleteCandidates] = useState<User[] | null>(null);

  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("user:update");
  const canDelete = hasPermission("user:delete");

  // SuperAdmin: null activeBranch = all branches; everyone else: locked to their branch
  const branchId = activeBranch?.id ?? undefined;

  useEffect(() => {
    setPage(1);
  }, [roleFilter, activeBranch?.id]);

  const { data, isLoading, isError, isFetching } = useUsers({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    roleId: roleFilter || undefined,
    branchId,
  });

  const users = useMemo(() => data?.users ?? [], [data?.users]);
  const meta = data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  const { data: rolesData } = useRoles();
  const roles = rolesData?.roles ?? [];

  const selection = useDataTableSelection<User>({
    data: users,
    rowKey: (u) => u.id,
  });

  const bulkUpdate = useBulkUpdateUsers();
  const bulkDelete = useBulkDeleteUsers();

  const editingUser = users.find((u) => u.id === editingId) ?? null;

  function commitSearch() {
    setPage(1);
    setDebouncedSearch(search);
  }

  function clearSearch() {
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  }

  function exportSelected(items: User[]) {
    downloadCsv(
      `dana-motors-users-${new Date().toISOString().split("T")[0]}`,
      exportRows(items),
      exportColumns(),
    );
  }

  function exportSelectedExcel(items: User[]) {
    downloadExcel(
      `dana-motors-users-${new Date().toISOString().split("T")[0]}`,
      exportRows(items),
      exportColumns(),
    );
  }

  function shareSelected(items: User[]) {
    const text = items.map(formatUserText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Dana Motors Users`,
      text,
    });
  }

  function emailSelected(items: User[]) {
    const body = items.map(formatUserText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} User${items.length === 1 ? "" : "s"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: User[]) {
    const message = items.map(formatUserText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  function activateSelected(items: User[]) {
    bulkUpdate.mutate({
      users: items.filter((u) => !u.isActive),
      payload: { isActive: true },
      label: "activated",
    });
    selection.clear();
  }

  function deactivateSelected(items: User[]) {
    bulkUpdate.mutate({
      users: items.filter((u) => u.isActive),
      payload: { isActive: false },
      label: "deactivated",
    });
    selection.clear();
  }

  function confirmDeleteSelected(items: User[]) {
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

  const columns: Column<User>[] = [
    {
      header: "User",
      render: (u) => (
        <div className="flex items-center gap-3">
          <span className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-black text-primary">
            {getUserInitials(u)}
          </span>
          <span className="font-medium">
            {u.firstName} {u.lastName}
          </span>
        </div>
      ),
    },
    {
      header: "Email",
      render: (u) => u.email,
      className: "text-muted-foreground",
    },
    {
      header: "Role",
      render: (u) => (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
          {u.role?.name ?? "—"}
        </span>
      ),
    },
    {
      header: "Branch",
      render: (u) =>
        u.branch?.name ?? <span className="text-border">—</span>,
      className: "text-muted-foreground",
    },
    {
      header: "Phone",
      render: (u) =>
        u.phoneNumber ?? <span className="text-border">—</span>,
      className: "text-muted-foreground",
    },
    {
      header: "Status",
      render: (u) => (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            u.isActive
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
              : "bg-red-50 text-red-700 ring-1 ring-red-600/20",
          )}
        >
          {u.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (u) => (
        <DataTableRowActions
          item={u}
          quickActions={[
            canEdit && {
              id: "edit",
              label: "Edit",
              icon: <Pencil className="size-3.5" />,
              onClick: () => setEditingId(u.id),
            },
          ]}
          actions={[
            {
              id: "view",
              label: "View details",
              icon: <Eye className="size-4" />,
              onClick: () => router.push(`/users/${u.id}`),
            },
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([u]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: getUserFullName(u),
                  text: formatUserText(u),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `User: ${getUserFullName(u)}`,
                  body: formatUserText(u),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatUserText(u) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              shortcut: "⌘C",
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/users/${u.id}`,
                  "User link copied",
                ),
            },
            canEdit &&
              (u.isActive
                ? {
                    id: "deactivate",
                    label: "Deactivate",
                    icon: <X className="size-4" />,
                    onClick: () =>
                      bulkUpdate.mutate({
                        users: [u],
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
                        users: [u],
                        payload: { isActive: true },
                        label: "activated",
                      }),
                  }),
            canDelete && {
              id: "delete",
              label: "Delete",
              icon: <Trash2 className="size-4" />,
              destructive: true,
              onClick: () => setDeleteCandidates([u]),
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
            Failed to load users. Check the API connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={users}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          debouncedSearch || roleFilter
            ? `No users matching your filters`
            : "No users yet. Add one above."
        }
        searchQuery={debouncedSearch}
        rowKey={(u) => u.id}
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
            placeholder="Search by name or email…"
            isLoading={isLoading}
            isFetching={isFetching}
            filters={
              <select
                className="h-10 rounded-lg border border-[#e8edf3] bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">All roles</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            }
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
        title="Edit user"
      >
        {editingUser && (
          <UserEditForm
            user={editingUser}
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
            ? `Delete ${pluralize(deleteCandidates.length, "user")}?`
            : "Delete user?"
        }
        message={
          deleteCandidates && deleteCandidates.length > 1
            ? `This will permanently remove ${pluralize(deleteCandidates.length, "user")}. This cannot be undone.`
            : `This will permanently remove ${deleteCandidates?.[0] ? getUserFullName(deleteCandidates[0]) : "this user"}. This cannot be undone.`
        }
        isPending={bulkDelete.isPending}
      />
    </>
  );
}
