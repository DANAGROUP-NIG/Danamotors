"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ModalFame from "@/components/modals/ModalFame";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DELETE_ROLES, CUSTOMER_UPDATE_ROLES } from "@/features/auth/roles";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { useCustomers } from "../hooks/use-customers";
import { getCustomerInitials } from "../services/customer.service";
import { CustomerDeleteButton } from "./CustomerDeleteButton";
import { CustomerEditForm } from "./CustomerEditForm";
import type { Customer } from "../types/customer.types";

const PAGE_SIZE = 10;

export function CustomersTable() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);

  const router = useRouter();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canDelete = hasAccess(DELETE_ROLES);
  const canEdit = hasAccess(CUSTOMER_UPDATE_ROLES);
  const canManage = canEdit || canDelete;

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id]);

  const { data, isLoading, isError, isFetching } = useCustomers({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    branchId: activeBranch?.id,
  });

  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const editingCustomer =
    data?.customers?.find((c) => c.id === editingId) ?? null;

  function commitSearch() {
    setPage(1);
    setDebouncedSearch(search);
  }

  function clearSearch() {
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
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
    ...(canManage
      ? [
          {
            header: "Actions",
            headerClassName: "text-right",
            render: (c: Customer) => (
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    aria-label={`Edit ${c.firstName} ${c.lastName}`}
                    onClick={() => setEditingId(c.id)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {canDelete && <CustomerDeleteButton customer={c} />}
              </div>
            ),
          },
        ]
      : []),
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
        data={data?.customers ?? []}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          debouncedSearch
            ? `No customers matching "${debouncedSearch}"`
            : "No customers yet. Add one above."
        }
        rowKey={(c) => c.id}
        onRowClick={(c) => router.push(`/customers/${c.id}`)}
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
          placeholder="Search by name, email, or phone…"
          isLoading={isLoading}
          isFetching={isFetching}
        />
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
    </>
  );
}
