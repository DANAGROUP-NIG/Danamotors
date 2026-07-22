"use client";

import { useEffect, useState } from "react";
import { Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DELETE_ROLES } from "@/features/auth/roles";
import { useUsers } from "../hooks/use-users";
import { useRoles } from "../hooks/use-roles";
import { getUserInitials } from "../services/user.service";
import { UserEditForm } from "./UserEditForm";
import { UserDeleteButton } from "./UserDeleteButton";
import type { User } from "../types/user.types";

const PAGE_SIZE = 10;

export function UsersTable() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("");

  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canDelete = hasAccess(DELETE_ROLES);

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
    <div className="grid gap-4">
      {/* Search + filter bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-10 w-full rounded-lg border border-[#e8edf3] bg-white pl-9 pr-9 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitSearch()}
          />
          {search && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={clearSearch}
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
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
        <Button
          variant="outline"
          onClick={commitSearch}
          disabled={isLoading || isFetching}
        >
          Search
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[#e8edf3] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e8edf3] bg-[#f8fafc]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Branch</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows />
              ) : !data?.users?.length ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    {debouncedSearch
                      ? `No users matching "${debouncedSearch}"`
                      : "No users yet. Add one above."}
                  </td>
                </tr>
              ) : (
                data.users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isEditing={editingId === user.id}
                    onEdit={() =>
                      setEditingId((prev) =>
                        prev === user.id ? null : user.id,
                      )
                    }
                    onEditSuccess={() => setEditingId(null)}
                    onEditCancel={() => setEditingId(null)}
                    canDelete={canDelete}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {total > PAGE_SIZE && (
          <div
            className={cn(
              "flex items-center justify-between border-t border-[#e8edf3] px-4 py-3",
              isFetching && "opacity-60",
            )}
          >
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Row ───────────────────────────────────────────────────────────────────────

function UserRow({
  user,
  isEditing,
  onEdit,
  onEditSuccess,
  onEditCancel,
  canDelete,
}: {
  user: User;
  isEditing: boolean;
  onEdit: () => void;
  onEditSuccess: () => void;
  onEditCancel: () => void;
  canDelete: boolean;
}) {
  return (
    <>
      <tr
        className={cn(
          "border-t border-border transition-colors",
          isEditing ? "bg-muted/50" : "hover:bg-muted/30",
        )}
      >
        {/* Avatar + name */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-black text-primary">
              {getUserInitials(user)}
            </span>
            <span className="font-medium">
              {user.firstName} {user.lastName}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
        <td className="px-4 py-3">
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            {user.role?.name ?? "—"}
          </span>
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {user.branch?.name ?? <span className="text-border">—</span>}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {user.phoneNumber ?? <span className="text-border">—</span>}
        </td>
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              user.isActive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700",
            )}
          >
            {user.isActive ? "Active" : "Inactive"}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                "h-7 w-7 p-0",
                isEditing
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label={`Edit ${user.firstName} ${user.lastName}`}
              onClick={onEdit}
            >
              <Pencil className="size-3.5" />
            </Button>
            {canDelete && <UserDeleteButton user={user} />}
          </div>
        </td>
      </tr>

      {/* Inline edit row */}
      {isEditing && (
        <tr className="border-t border-border bg-muted/30">
          <td colSpan={7} className="px-4 py-4">
            <UserEditForm
              user={user}
              onSuccess={onEditSuccess}
              onCancel={onEditCancel}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-border">
          <td className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="size-8 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3" />
        </tr>
      ))}
    </>
  );
}
