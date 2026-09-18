"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Download,
  Eye,
  FileSpreadsheet,
  Link2,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import {
  copyToClipboard,
  downloadCsv,
  downloadExcel,
  openMailto,
  openWhatsApp,
  shareItems,
} from "@/lib/table-actions";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/lib/utils";
import { RoleCreateModal } from "./role-create-modal";
import { useAdminRoles, useDeleteRole } from "../hooks/use-admin-roles";
import type { RoleListItem } from "../api/role.api";

const SYSTEM_ROLE_NAMES = new Set([
  "SuperAdmin",
  "Admin",
  "GeneralStoreManager",
  "BranchStoreManager",
  "WorkshopManager",
  "Accountant",
  "ServiceAdviser",
  "Technician",
  "Receptionist",
  "ReceptionManager",
]);

const PAGE_SIZE = 10;

function formatRoleText(role: RoleListItem) {
  const permissions = role.permissionsCount ?? role._count?.permissions ?? 0;
  return `*${role.name}*\nDescription: ${role.description ?? "N/A"}\nPermissions: ${permissions}\nUsers: ${role.usersCount ?? 0}\nType: ${SYSTEM_ROLE_NAMES.has(role.name) ? "System" : "Custom"}`;
}

function exportColumns() {
  return [
    { key: "name", label: "Role Name" },
    { key: "description", label: "Description" },
    { key: "permissionsCount", label: "Permissions" },
    { key: "usersCount", label: "Users" },
  ];
}

function toExportRows(items: RoleListItem[]) {
  return items.map((role) => ({
    name: role.name,
    description: role.description ?? "",
    permissionsCount: role.permissionsCount ?? role._count?.permissions ?? 0,
    usersCount: role.usersCount ?? 0,
  }));
}

export function RolesPage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const { hasPermission } = useAuth();
  const canView = hasPermission("role:read");
  const canCreate = hasPermission("role:create");
  const canUpdate = hasPermission("role:update");
  const canDelete = hasPermission("role:delete");
  const { data, isLoading, isError, isFetching } = useAdminRoles();
  const deleteRole = useDeleteRole();

  const roles = useMemo(() => data?.roles ?? [], [data]);
  const filteredRoles = useMemo(() => {
    if (!committedSearch) return roles;
    const query = committedSearch.toLowerCase();
    return roles.filter(
      (role) =>
        role.name.toLowerCase().includes(query) ||
        role.description?.toLowerCase().includes(query),
    );
  }, [roles, committedSearch]);
  const totalPages = Math.max(1, Math.ceil(filteredRoles.length / PAGE_SIZE));
  const paginatedRoles = useMemo(
    () => filteredRoles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, filteredRoles],
  );

  const selection = useDataTableSelection<RoleListItem>({
    data: paginatedRoles,
    rowKey: (role) => role.id,
  });

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function commitSearch() {
    setPage(1);
    setCommittedSearch(search);
  }

  function clearSearch() {
    setSearch("");
    setCommittedSearch("");
    setPage(1);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteRole.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  function exportRolesCsv(items: RoleListItem[]) {
    downloadCsv(
      `roles-${new Date().toISOString().split("T")[0]}`,
      toExportRows(items),
      exportColumns(),
    );
  }

  function exportRolesExcel(items: RoleListItem[]) {
    downloadExcel(
      `roles-${new Date().toISOString().split("T")[0]}`,
      toExportRows(items),
      exportColumns(),
    );
  }

  function shareRoles(items: RoleListItem[]) {
    shareItems({
      title: `${items.length} Dana Motors Role${items.length === 1 ? "" : "s"}`,
      text: items.map(formatRoleText).join("\n\n---\n\n"),
    });
  }

  function emailRoles(items: RoleListItem[]) {
    openMailto({
      subject: `${items.length} Role${items.length === 1 ? "" : "s"} from Dana Motors`,
      body: items.map(formatRoleText).join("\n\n---\n\n"),
    });
  }

  function whatsappRoles(items: RoleListItem[]) {
    openWhatsApp({ message: items.map(formatRoleText).join("\n\n---\n\n") });
  }

  if (!canView) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-500">You do not have access to view roles.</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-500">Failed to load roles.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Roles & Permissions"
        description="Manage roles and their associated permissions"
        actions={
          <div className="flex items-center gap-2">
            <ActionMenu
              align="end"
              trigger={
                <Button variant="outline" size="sm" className="cursor-pointer gap-1.5">
                  <Download className="size-4" />
                  Export
                  <ChevronDown className="size-3.5" />
                </Button>
              }
            >
              <ActionMenuItem
                icon={<Download className="size-4" />}
                onClick={() => exportRolesCsv(roles)}
              >
                Export CSV
              </ActionMenuItem>
              <ActionMenuItem
                icon={<FileSpreadsheet className="size-4" />}
                onClick={() => exportRolesExcel(roles)}
              >
                Export Excel
              </ActionMenuItem>
            </ActionMenu>
            <Button onClick={() => setIsModalOpen(true)} size="sm" className="cursor-pointer" disabled={!canCreate}>
              <Plus className="size-4" />
              Create Role
            </Button>
          </div>
        }
      />

      <RoleCreateModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />

      <DataTable
        data={paginatedRoles}
        isLoading={isLoading}
        isFetching={isFetching}
        rowKey={(role) => role.id}
        searchQuery={committedSearch || undefined}
        selection={selection}
        columns={[
          {
            header: "Role Name",
            render: (role) => (
              <div className="flex flex-col">
                <span className="font-semibold text-foreground">{role.name}</span>
                {role.description && (
                  <span className="mt-1 text-xs text-muted-foreground">{role.description}</span>
                )}
              </div>
            ),
          },
          {
            header: "Permissions",
            render: (role) => (
              <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground">
                {role.permissionsCount ?? role._count?.permissions ?? 0} permissions
              </span>
            ),
          },
          {
            header: "Users",
            render: (role) => (
              <span className="text-sm text-muted-foreground">{role.usersCount ?? 0}</span>
            ),
          },
          {
            header: "Type",
            render: (role) => (
              <span
                className={cn(
                  "inline-flex rounded-full px-2 py-1 text-xs font-medium",
                  SYSTEM_ROLE_NAMES.has(role.name)
                    ? "bg-slate-100 text-slate-700"
                    : "bg-emerald-50 text-emerald-700",
                )}
              >
                {SYSTEM_ROLE_NAMES.has(role.name) ? "System" : "Custom"}
              </span>
            ),
          },
          {
            header: "Actions",
            headerClassName: "text-right",
            className: "text-right",
            render: (role) => (
              <DataTableRowActions
                item={role}
                quickActions={[
                  canUpdate && {
                    id: "edit",
                    label: `Edit ${role.name}`,
                    icon: <Pencil className="size-3.5" />,
                    onClick: () => router.push(`/settings/roles/${role.id}`),
                  },
                ]}
                actions={[
                  {
                    id: "view",
                    label: "View details",
                    icon: <Eye className="size-4" />,
                    onClick: () => router.push(`/settings/roles/${role.id}`),
                  },
                  {
                    id: "download",
                    label: "Download CSV",
                    icon: <Download className="size-4" />,
                    onClick: () => exportRolesCsv([role]),
                  },
                  {
                    id: "share",
                    label: "Share",
                    icon: <Share2 className="size-4" />,
                    onClick: () => shareRoles([role]),
                  },
                  {
                    id: "email",
                    label: "Email",
                    icon: <Mail className="size-4" />,
                    onClick: () => emailRoles([role]),
                  },
                  {
                    id: "whatsapp",
                    label: "WhatsApp",
                    icon: <MessageCircle className="size-4" />,
                    onClick: () => whatsappRoles([role]),
                  },
                  {
                    id: "copy-link",
                    label: "Copy link",
                    icon: <Link2 className="size-4" />,
                    shortcut: "⌘C",
                    onClick: () =>
                      copyToClipboard(
                        `${window.location.origin}/settings/roles/${role.id}`,
                        "Role link copied",
                      ),
                  },
                  canDelete &&
                    !SYSTEM_ROLE_NAMES.has(role.name) && {
                      id: "delete",
                      label: "Delete",
                      icon: <Trash2 className="size-4" />,
                      destructive: true,
                      onClick: () => setDeleteTarget({ id: role.id, name: role.name }),
                    },
                ]}
              />
            ),
          },
        ]}
        emptyMessage={
          committedSearch ? "No roles match your search." : "No roles found."
        }
        page={page}
        pageSize={PAGE_SIZE}
        total={filteredRoles.length}
        totalPages={totalPages}
        onPageChange={setPage}
      >
        <div className="flex flex-col gap-4">
          <DataTableToolbar
            search={search}
            onSearchChange={setSearch}
            onSearch={commitSearch}
            onClearSearch={clearSearch}
            placeholder="Search roles…"
            isLoading={isLoading}
            isFetching={isFetching}
          />

          <DataTableBulkToolbar
            selectedCount={selection.selectedIds.size}
            totalCount={filteredRoles.length}
            selectedItems={selection.selectedItems}
            onClear={selection.clear}
            actions={[
              {
                id: "export",
                label: "CSV",
                icon: <Download className="size-3.5" />,
                variant: "ghost",
                onClick: exportRolesCsv,
              },
              {
                id: "excel",
                label: "Excel",
                icon: <FileSpreadsheet className="size-3.5" />,
                variant: "ghost",
                onClick: exportRolesExcel,
              },
              {
                id: "share",
                label: "Share",
                icon: <Share2 className="size-3.5" />,
                variant: "ghost",
                onClick: shareRoles,
              },
              {
                id: "email",
                label: "Email",
                icon: <Mail className="size-3.5" />,
                variant: "ghost",
                onClick: emailRoles,
              },
              {
                id: "whatsapp",
                label: "WhatsApp",
                icon: <MessageCircle className="size-3.5" />,
                variant: "ghost",
                onClick: whatsappRoles,
              },
            ]}
          />
        </div>
      </DataTable>

      <ModalFame isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete role">
        <div className="space-y-4">
          <p className="text-base font-semibold">Delete Role &quot;{deleteTarget?.name}&quot;?</p>
          <p className="text-sm text-slate-600">
            This action cannot be undone. All users currently assigned to this role will need to be reassigned.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteRole.isPending}>
              {deleteRole.isPending ? "Deleting…" : "Delete Role"}
            </Button>
          </div>
        </div>
      </ModalFame>
    </div>
  );
}
