"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ModalFame from "@/components/modals/ModalFame";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DELETE_ROLES, USER_UPDATE_ROLES } from "@/features/auth/roles";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTable } from "@/components/ui/table-components/DataTable";
import { useUsers } from "../hooks/use-users";
import { useRoles } from "../hooks/use-roles";
import { getUserInitials } from "../services/user.service";
import { UserEditForm } from "./UserEditForm";
import { UserDeleteButton } from "./UserDeleteButton";

const PAGE_SIZE = 10;

export function UsersTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("");

  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canDelete = hasAccess(DELETE_ROLES);
  const canUpdate = hasAccess(USER_UPDATE_ROLES);

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

  const { data: rolesData } = useRoles();
  const roles = rolesData?.roles ?? [];

  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const editingUser = data?.users?.find((u) => u.id === editingId) ?? null;

  function commitSearch() {
    setPage(1);
    setDebouncedSearch(search);
  }

  function clearSearch() {
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  }

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
        columns={[
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
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700",
                )}
              >
                {u.isActive ? "Active" : "Inactive"}
              </span>
            ),
          },
          {
            header: "Actions",
            render: (u) => (
              <div
                className="flex items-center justify-end gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {canUpdate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    aria-label={`Edit ${u.firstName} ${u.lastName}`}
                    onClick={() => setEditingId(u.id)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {canDelete && <UserDeleteButton user={u} />}
              </div>
            ),
            headerClassName: "text-right",
            className: "text-right",
          },
        ]}
        data={data?.users ?? []}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          debouncedSearch
            ? `No users matching "${debouncedSearch}"`
            : "No users yet. Add one above."
        }
        searchQuery={debouncedSearch}
        rowKey={(u) => u.id}
        onRowClick={(u) => router.push(`/users/${u.id}`)}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
      >
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
    </>
  );
}
