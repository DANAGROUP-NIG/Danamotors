"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ModalFame from "@/components/modals/ModalFame";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DELETE_ROLES, CUSTOMER_CREATE_ROLES } from "@/features/auth/roles";
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

  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canDelete = hasAccess(DELETE_ROLES);
  const canEdit = hasAccess(CUSTOMER_CREATE_ROLES);
  const canManage = canEdit || canDelete;

  // Reset to page 1 when branch changes
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
    <div className="grid gap-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-10 w-full rounded-lg border border-[#e8edf3] bg-white pl-9 pr-9 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="Search by name, email, or phone…"
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

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[#e8edf3] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e8edf3] bg-[#f8fafc]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Address</th>
                {canManage && <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows />
              ) : !data?.customers?.length ? (
                <tr>
                  <td
                    colSpan={canManage ? 5 : 4}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    {debouncedSearch
                      ? `No customers matching "${debouncedSearch}"`
                      : "No customers yet. Add one above."}
                  </td>
                </tr>
              ) : (
                data.customers.map((customer) => (
                   <CustomerRow
                     key={customer.id}
                     customer={customer}
                     canDelete={canDelete}
                     canEdit={canEdit}
                     canManage={canManage}
                     onEdit={() => setEditingId(customer.id)}
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

      {/* Edit modal */}
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
    </div>
  );
}

// ─── Row ───────────────────────────────────────────────────────────────────────

function CustomerRow({
  customer,
  canDelete,
  canEdit,
  canManage,
  onEdit,
}: {
  customer: Customer;
  canDelete: boolean;
  canEdit: boolean;
  canManage: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  return (
    <tr
      className="cursor-pointer border-t border-border transition-colors hover:bg-muted/30"
      onClick={() => router.push(`/customers/${customer.id}`)}
    >
      {/* Avatar + name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-black text-primary">
            {getCustomerInitials(customer)}
          </span>
          <span className="font-medium">
            {customer.firstName} {customer.lastName}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{customer.email}</td>
      <td className="px-4 py-3 text-muted-foreground">
        {customer.phoneNumber ?? <span className="text-border">—</span>}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {customer.address ?? <span className="text-border">—</span>}
      </td>
      {canManage && (
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                aria-label={`Edit ${customer.firstName} ${customer.lastName}`}
                onClick={onEdit}
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {canDelete && <CustomerDeleteButton customer={customer} />}
          </div>
        </td>
      )}
    </tr>
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
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-36 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3" />
        </tr>
      ))}
    </>
  );
}
