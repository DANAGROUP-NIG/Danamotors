"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useAdminRole, useDeleteRole, useUpdateRole, useUpdateRolePermissions } from "../hooks/use-admin-roles";
import { PermissionGrid } from "./permission-grid";

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

export function RoleDetailPage() {
  const params = useParams<{ id: string }>();
  const roleId = params?.id ?? "";
  const { data, isLoading } = useAdminRole(roleId);
  const updateMeta = useUpdateRole(roleId);
  const updatePermissions = useUpdateRolePermissions(roleId);
  const deleteRole = useDeleteRole();
  const { hasAccess } = useAuth();
  const canEdit = hasAccess(["superadmin", "admin"] as any);

  const role = data?.role;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (!role) return;

    setName(role.name ?? "");
    setDescription(role.description ?? "");
    setPermissions(
      Array.isArray(role.permissions)
        ? role.permissions.map((permission) => permission.name)
        : [],
    );
  }, [role]);

  const isSystemRole = useMemo(
    () => (role?.name ? SYSTEM_ROLE_NAMES.has(role.name) : false),
    [role?.name],
  );

  if (!role && !isLoading) {
    return <div className="p-6 text-sm text-red-500">Role not found.</div>;
  }

  if (!role) {
    return <div className="p-6">Loading…</div>;
  }

  function handleSaveMeta() {
    if (!role) return;
    updateMeta.mutate({
      name: name.trim() || role.name,
      description: description.trim() || role.description || undefined,
    });
  }

  function handleSavePermissions() {
    updatePermissions.mutate(permissions);
  }

  function handleDelete() {
    deleteRole.mutate(roleId, {
      onSuccess: () => setShowDeleteModal(false),
    });
  }

  const metaDisabled = isSystemRole || !canEdit;

  return (
    <div className="p-4 lg:p-6">
      <Link href="/settings/roles" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Roles
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{role.name}</h1>
            <p className="text-sm text-muted-foreground">{role.description || "No description provided"}</p>
          </div>
        </div>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(250px,0.7fr)_minmax(0,1.3fr)]">
          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Name</label>
                <div className="relative">
                    <input
                        value={name}
                    onChange={(event) => setName(event.target.value)}
                    readOnly={isSystemRole}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-slate-50"
                    />
                    {isSystemRole && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                        <Lock className="size-3.5" /> System role names cannot be changed
                    </div>
                    )}
                </div>
                </div>

                <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Description</label>
                <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                </div>

                <Button onClick={handleSaveMeta} disabled={metaDisabled || updateMeta.isPending}>
                {updateMeta.isPending ? "Saving…" : "Save Changes"}
                </Button>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Permissions</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">Choose what this role can access.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {permissions.length} selected
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                <PermissionGrid
                    selectedPermissions={permissions}
                    onChange={setPermissions}
                />
                <Button onClick={handleSavePermissions} disabled={updatePermissions.isPending}>
                    {updatePermissions.isPending ? "Saving…" : "Save Permissions"}
                </Button>
                </div>
            </div>
        </div>

        {!isSystemRole && (
          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-red-700">Danger zone</p>
                <p className="text-sm text-red-600">This will permanently delete the role and remove access for assigned users.</p>
              </div>
              <Button variant="destructive" onClick={() => setShowDeleteModal(true)}>
                <Trash2 className="size-4" /> Delete Role
              </Button>
            </div>
          </div>
        )}
      </div>

      <ModalFame isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete role">
        <div className="space-y-4">
          <p className="text-base font-semibold">Delete Role "{role.name}"?</p>
          <p className="text-sm text-slate-600">
            This action cannot be undone. All users currently assigned to this role will need to be reassigned.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
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
