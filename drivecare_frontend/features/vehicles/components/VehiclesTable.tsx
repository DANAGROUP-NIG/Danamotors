"use client";

import { useEffect, useState } from "react";
import { Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DELETE_ROLES } from "@/features/auth/roles";
import { useVehicles } from "../hooks/use-vehicles";
import { VehicleDeleteButton } from "./VehicleDeleteButton";
import { VehicleEditForm } from "./VehicleEditForm";
import type { Vehicle } from "../types/vehicle.types";

const PAGE_SIZE = 10;

export function VehiclesTable() {
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canDelete = hasAccess(DELETE_ROLES);

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id]);

  const { data, isLoading, isError, isFetching } = useVehicles({ page, limit: PAGE_SIZE, search: committedSearch || undefined, branchId: activeBranch?.id });
  const vehicles = data?.vehicles ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  function commitSearch() { setPage(1); setCommittedSearch(search); }
  function clearSearch() { setSearch(""); setCommittedSearch(""); setPage(1); }

  if (isError) {
    return (
      <Card><CardContent className="py-12 text-center">
        <p className="text-sm text-red-500">Failed to load vehicles. Check the API connection and try again.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search by make, model, VIN, or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitSearch()}
          />
          {search && (
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={clearSearch} aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button variant="outline" onClick={commitSearch} disabled={isLoading || isFetching}>Search</Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Vehicle</th>
                <th className="px-4 py-3 text-left font-semibold">VIN</th>
                <th className="px-4 py-3 text-left font-semibold">Customer</th>
                <th className="px-4 py-3 text-left font-semibold">Year</th>
                <th className="px-4 py-3 text-left font-semibold">Color</th>
                <th className="px-4 py-3 text-left font-semibold">Ownership</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows />
              ) : !vehicles.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {committedSearch ? `No vehicles matching "${committedSearch}"` : "No vehicles yet. Add one above."}
                  </td>
                </tr>
              ) : (
                vehicles.map((vehicle) => (
                  <VehicleRow
                    key={vehicle.id}
                    vehicle={vehicle}
                    isEditing={editingId === vehicle.id}
                    onEdit={() => setEditingId((prev) => prev === vehicle.id ? null : vehicle.id)}
                    onEditSuccess={() => setEditingId(null)}
                    onEditCancel={() => setEditingId(null)}
                    canDelete={canDelete}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta && meta.total > PAGE_SIZE && (
          <div className={cn("flex items-center justify-between border-t border-border px-4 py-3", isFetching && "opacity-60")}>
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, meta.total)} of {meta.total}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VehicleRow({ vehicle, isEditing, onEdit, onEditSuccess, onEditCancel, canDelete }: {
  vehicle: Vehicle; isEditing: boolean;
  onEdit: () => void; onEditSuccess: () => void; onEditCancel: () => void; canDelete: boolean;
}) {
  const customerName = vehicle.customer ? `${vehicle.customer.firstName} ${vehicle.customer.lastName}` : "—";
  return (
    <>
      <tr className={cn("border-t border-border transition-colors", isEditing ? "bg-muted/50" : "hover:bg-muted/30")}>
        <td className="px-4 py-3 font-medium">{vehicle.make ?? "—"} {vehicle.model ?? ""}</td>
        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{vehicle.vin}</td>
        <td className="px-4 py-3 text-muted-foreground">{customerName}</td>
        <td className="px-4 py-3 text-muted-foreground">{vehicle.year ?? <span className="text-border">—</span>}</td>
        <td className="px-4 py-3 text-muted-foreground">{vehicle.color ?? <span className="text-border">—</span>}</td>
        <td className="px-4 py-3 text-muted-foreground">{vehicle.ownershipStatus ?? <span className="text-border">—</span>}</td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm" variant="ghost"
              className={cn("h-7 w-7 p-0", isEditing ? "text-primary" : "text-muted-foreground hover:text-foreground")}
              aria-label={`Edit ${vehicle.make} ${vehicle.model}`}
              onClick={onEdit}
            >
              <Pencil className="size-3.5" />
            </Button>
            {canDelete && <VehicleDeleteButton vehicle={vehicle} />}
          </div>
        </td>
      </tr>
      {isEditing && (
        <tr className="border-t border-border bg-muted/30">
          <td colSpan={7} className="px-4 py-4">
            <VehicleEditForm vehicle={vehicle} onSuccess={onEditSuccess} onCancel={onEditCancel} />
          </td>
        </tr>
      )}
    </>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-border">
          {Array.from({ length: 6 }).map((__, j) => (
            <td key={j} className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-muted" /></td>
          ))}
          <td className="px-4 py-3" />
        </tr>
      ))}
    </>
  );
}
