"use client";

import { useState } from "react";
import { Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ModalFame from "@/components/modals/ModalFame";
import { useBranches } from "../hooks/use-branches";
import { BranchEditForm } from "./BranchEditForm";
import { BranchDeleteButton } from "./BranchDeleteButton";
import type { Branch } from "../types/branch.types";

const PAGE_SIZE = 10;

export function BranchesTable() {
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading, isError, isFetching } = useBranches({
    page,
    limit: PAGE_SIZE,
    search: committedSearch || undefined,
  });
  const branches = data?.branches ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;

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
    <div className="grid gap-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-10 w-full rounded-lg border border-[#e8edf3] bg-white pl-9 pr-9 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="Search by name, city, or state…"
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
        <Button
          variant="outline"
          onClick={commitSearch}
          disabled={isLoading || isFetching}
        >
          Search
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e8edf3] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e8edf3] bg-[#f8fafc]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">City</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">State</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Users</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows />
              ) : !branches.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {committedSearch
                      ? `No branches matching "${committedSearch}"`
                      : "No branches yet. Add one above."}
                  </td>
                </tr>
              ) : (
                branches.map((branch) => (
                  <BranchRow
                    key={branch.id}
                    branch={branch}
                    onEdit={() => setEditingId(branch.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta && meta.total > PAGE_SIZE && (
          <div
            className={cn(
              "flex items-center justify-between border-t border-[#e8edf3] px-4 py-3",
              isFetching && "opacity-60",
            )}
          >
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, meta.total)} of {meta.total}
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

      {/* Edit modal */}
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
    </div>
  );
}

function BranchRow({
  branch,
  onEdit,
}: {
  branch: Branch;
  onEdit: () => void;
}) {
  return (
    <tr className="border-t border-border transition-colors hover:bg-muted/30">
      <td className="px-4 py-3 font-medium">{branch.name}</td>
      <td className="px-4 py-3 text-muted-foreground">
        {branch.city ?? <span className="text-border">—</span>}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {branch.state ?? <span className="text-border">—</span>}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {branch.phoneNumber ?? <span className="text-border">—</span>}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {branch.email ?? <span className="text-border">—</span>}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{branch.usersCount}</td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            branch.isActive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700",
          )}
        >
          {branch.isActive ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label={`Edit ${branch.name}`}
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <BranchDeleteButton branch={branch} />
        </div>
      </td>
    </tr>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-border">
          {Array.from({ length: 7 }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </td>
          ))}
          <td className="px-4 py-3" />
        </tr>
      ))}
    </>
  );
}
