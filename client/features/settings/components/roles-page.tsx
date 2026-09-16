"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable } from "@/components/ui/table-components/DataTable";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/lib/utils";
import { RoleCreateModal } from "./role-create-modal";
import { useAdminRoles, useDeleteRole } from "../hooks/use-admin-roles";

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

export function RolesPage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const { hasPermission } = useAuth();
  const canView = hasPermission("role:read");
  const canCreate = hasPermission("role:create");
  const canDelete = hasPermission("role:delete");
  const { data, isLoading, isError, isFetching } = useAdminRoles();
  const deleteRole = useDeleteRole();

  const roles = useMemo(() => data?.roles ?? [], [data]);
  const totalPages = Math.max(1, Math.ceil(roles.length / PAGE_SIZE));
  const paginatedRoles = useMemo(
    () => roles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, roles],
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function handleDelete() {
    if (!deleteTarget) return;
    deleteRole.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
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
          <Button onClick={() => setIsModalOpen(true)} size="sm" className="cursor-pointer" disabled={!canCreate}>
            <Plus className="size-4" />
            Create Role
          </Button>
        }
      />

      <RoleCreateModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />

      <DataTable
        data={paginatedRoles}
        isLoading={isLoading}
        isFetching={isFetching}
        rowKey={(role) => role.id}
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
            render: (role) => (
              <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Edit ${role.name}`}
                  disabled={!hasPermission("role:update")}
                  onClick={() => router.push(`/settings/roles/${role.id}`)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Delete ${role.name}`}
                  disabled={!canDelete || SYSTEM_ROLE_NAMES.has(role.name)}
                  title={SYSTEM_ROLE_NAMES.has(role.name) ? "System roles cannot be deleted" : undefined}
                  onClick={() => setDeleteTarget({ id: role.id, name: role.name })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ),
          },
        ]}
        onRowClick={(role) => router.push(`/settings/roles/${role.id}`)}
        emptyMessage="No roles found."
        page={page}
        pageSize={PAGE_SIZE}
        total={roles.length}
        totalPages={totalPages}
        onPageChange={setPage}
      />

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
