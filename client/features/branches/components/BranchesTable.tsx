"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ModalFame from "@/components/modals/ModalFame";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
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
  const total = meta?.total ?? 0;
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
      render: (b) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label={`Edit ${b.name}`}
            onClick={() => setEditingId(b.id)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <BranchDeleteButton branch={b} />
        </div>
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
      >
        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          onSearch={commitSearch}
          onClearSearch={clearSearch}
          placeholder="Search by name, city, or state…"
          isLoading={isLoading}
          isFetching={isFetching}
        />
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
    </>
  );
}
