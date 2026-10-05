"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { apiGet, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { jobCardKeys } from "../api/job-card.keys";
import type { JobCard } from "../types/job-card.types";
import { canonicalJobStatus, hasJobBill } from "../types/job-card-status";

type IssuableStock = {
  partId: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  part: {
    id: string;
    partNumber: string;
    name: string;
    uom: string;
    unitPrice: number;
    retailRate?: number | null;
    partStatus: "ACTIVE" | "BLOCKED";
  };
};

function messageFrom(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { message?: string } } })
    ?.response;
  return response?.data?.message ?? fallback;
}

export function JobCardPartsSection({ jobCard }: { jobCard: JobCard }) {
  const { hasPermission, user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPart, setSelectedPart] = useState<IssuableStock | null>(null);
  const [issuanceId, setIssuanceId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [returnReason, setReturnReason] = useState("");
  const [returnQuantity, setReturnQuantity] = useState(1);

  const canIssue = hasPermission("partissuance:create");
  const canReturn = hasPermission("partreturn:create");
  const closed =
    hasJobBill(jobCard) ||
    ["DELIVERED", "CANCELLED"].includes(canonicalJobStatus(jobCard.status));

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setSelectedPart(null);
    setIssuanceId("");
    setQuantity(1);
    setReturnQuantity(1);
  }, [jobCard.branchId]);

  const stockQuery = useQuery({
    queryKey: ["job-card-issuable-parts", jobCard.branchId, debouncedSearch],
    queryFn: () => {
      const query = new URLSearchParams({
        branchId: jobCard.branchId,
        search: debouncedSearch,
        limit: "20",
      });
      return apiGet<{ stockItems: IssuableStock[] }>(
        `${API_ROUTES.inventory.stock.base}?${query.toString()}`,
      );
    },
    enabled: canIssue && !closed && debouncedSearch.length >= 2,
    staleTime: 15_000,
    retry: false,
  });

  const selectedIssuance = useMemo(
    () => jobCard.partIssuances?.find((row) => row.id === issuanceId),
    [issuanceId, jobCard.partIssuances],
  );
  const returnedQuantity =
    selectedIssuance?.returns.reduce(
      (total, item) =>
        total + (item.status.toUpperCase() === "REJECTED" ? 0 : item.quantity),
      0,
    ) ?? 0;
  const remainingReturn = Math.max(
    (selectedIssuance?.quantity ?? 0) - returnedQuantity,
    0,
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: jobCardKeys.all });
  };

  const issue = useMutation({
    mutationFn: () =>
      apiPost("/inventory/issuances", {
        sparePartId: selectedPart!.partId,
        jobCardId: jobCard.id,
        branchId: jobCard.branchId,
        issuedById: user?.id,
        quantity,
      }),
    onSuccess: () => {
      toast.success("Part issued to job card");
      setSearch("");
      setDebouncedSearch("");
      setSelectedPart(null);
      setQuantity(1);
      refresh();
    },
    onError: (error) =>
      toast.error(
        messageFrom(error, "Could not issue part. Check branch stock."),
      ),
  });

  const returnPart = useMutation({
    mutationFn: () =>
      apiPost("/inventory/returns", {
        partIssuanceId: issuanceId,
        branchId: jobCard.branchId,
        returnedById: user?.id,
        quantity: returnQuantity,
        reason: returnReason.trim(),
      }),
    onSuccess: () => {
      toast.success("Part return recorded");
      setIssuanceId("");
      setReturnQuantity(1);
      setReturnReason("");
      refresh();
    },
    onError: (error) =>
      toast.error(messageFrom(error, "Could not return part.")),
  });

  if (closed) return null;

  return (
    <section
      id="job-parts"
      className="grid gap-3 rounded-lg border bg-white p-4 print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="font-semibold">Parts</h2>
          <p className="text-xs text-muted-foreground">
            {jobCard.partIssuances?.length ?? 0} issuances recorded
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {jobCard.branch?.name ?? "Assigned branch"}
        </span>
      </div>

      {canIssue && (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_auto] sm:items-end">
          <Field label="Find part by number or name">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <input
                className={`${inputCls} h-9 pl-9 pr-9`}
                value={search}
                maxLength={100}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSelectedPart(null);
                }}
                placeholder="Enter at least 2 characters"
                autoComplete="off"
                aria-label="Search inventory by part number or name"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear part search"
                  className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    setSearch("");
                    setDebouncedSearch("");
                    setSelectedPart(null);
                  }}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </Field>
          <Field label="Qty">
            <input
              type="number"
              min="1"
              max={selectedPart?.availableQuantity}
              step="1"
              className={`${inputCls} h-9 tabular-nums`}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </Field>
          <Button
            type="button"
            size="sm"
            className="h-9"
            disabled={
              !selectedPart ||
              selectedPart.availableQuantity < 1 ||
              quantity < 1 ||
              quantity > (selectedPart?.availableQuantity ?? 0) ||
              issue.isPending
            }
            onClick={() => issue.mutate()}
          >
            {issue.isPending ? "Issuing..." : "Issue part"}
          </Button>

          {debouncedSearch.length >= 2 && !selectedPart && (
            <div className="sm:col-span-3">
              {stockQuery.isFetching ? (
                <p role="status" className="py-2 text-xs text-muted-foreground">
                  Searching branch stock...
                </p>
              ) : null}
              {stockQuery.isError && (
                <p role="alert" className="py-2 text-xs text-destructive">
                  {messageFrom(stockQuery.error, "Inventory search failed.")}
                </p>
              )}
              {!stockQuery.isFetching &&
                !stockQuery.isError &&
                stockQuery.data?.stockItems.length === 0 && (
                  <p className="py-2 text-xs text-muted-foreground">
                    No matching stocked parts in this branch.
                  </p>
                )}
              {!!stockQuery.data?.stockItems.length && (
                <ul
                  className="max-h-48 overflow-y-auto rounded-md border"
                  aria-label="Matching branch stock"
                >
                  {stockQuery.data.stockItems.map((row) => {
                    const available = Math.max(
                      row.availableQuantity ??
                        row.quantity - row.reservedQuantity,
                      0,
                    );
                    const retailRate = row.part.retailRate;
                    return (
                      <li key={row.partId}>
                        <button
                          type="button"
                          disabled={
                            available < 1 || row.part.partStatus !== "ACTIVE"
                          }
                          onClick={() => {
                            setSelectedPart(row);
                            setSearch("");
                            setDebouncedSearch("");
                            setQuantity(1);
                          }}
                          className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-2 text-left last:border-0 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {row.part.partNumber} · {row.part.name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {row.part.uom} · Retail{" "}
                              {retailRate == null
                                ? "not set"
                                : new Intl.NumberFormat("en-NG", {
                                    style: "currency",
                                    currency: "NGN",
                                  }).format(retailRate)}
                            </span>
                          </span>
                          <span className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                            {available} available
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {selectedPart && (
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 sm:col-span-3">
              <span className="min-w-0 truncate text-sm">
                <strong>{selectedPart.part.partNumber}</strong> ·{" "}
                {selectedPart.part.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {selectedPart.availableQuantity} available
              </span>
            </div>
          )}
        </div>
      )}

      {canReturn && !!jobCard.partIssuances?.length && (
        <div className="grid gap-2 border-t pt-3 sm:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)_auto] sm:items-end">
          <Field label="Return issued part">
            <select
              className={`${inputCls} h-9`}
              value={issuanceId}
              onChange={(event) => {
                setIssuanceId(event.target.value);
                setReturnQuantity(1);
              }}
            >
              <option value="">Select issuance</option>
              {jobCard.partIssuances.map((row) => {
                const returned = row.returns.reduce(
                  (sum, item) =>
                    sum +
                    (item.status.toUpperCase() === "REJECTED"
                      ? 0
                      : item.quantity),
                  0,
                );
                const remaining = Math.max(row.quantity - returned, 0);
                return (
                  <option
                    key={row.id}
                    value={row.id}
                    disabled={remaining === 0}
                  >
                    {row.sparePart.partNumber} · {row.sparePart.name} (
                    {remaining} remaining)
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="Qty">
            <input
              type="number"
              min="1"
              max={remainingReturn}
              step="1"
              className={`${inputCls} h-9 tabular-nums`}
              value={returnQuantity}
              onChange={(event) =>
                setReturnQuantity(Number(event.target.value))
              }
            />
          </Field>
          <Field label="Reason">
            <input
              className={`${inputCls} h-9`}
              value={returnReason}
              onChange={(event) => setReturnReason(event.target.value)}
              maxLength={500}
            />
          </Field>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9"
            disabled={
              !issuanceId ||
              remainingReturn < 1 ||
              returnQuantity < 1 ||
              returnQuantity > remainingReturn ||
              !returnReason.trim() ||
              returnPart.isPending
            }
            onClick={() => returnPart.mutate()}
          >
            {returnPart.isPending ? "Returning..." : "Return"}
          </Button>
        </div>
      )}

      {!canIssue && !canReturn && (
        <p className="text-sm text-muted-foreground">
          Parts are managed by inventory staff.
        </p>
      )}
    </section>
  );
}
