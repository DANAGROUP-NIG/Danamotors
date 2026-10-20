"use client";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/apiClient";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";

type Vehicle = { id: string; vin: string; registrationNumber: string | null };
type Page = {
  vehicles: Vehicle[];
  selected: Vehicle[];
  nextCursor: string | null;
};
export function ReportVehicleFilter({
  value,
  branchId,
  onChange,
}: {
  value: string;
  branchId?: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search);
  const ids = value ? value.split(",") : [];
  const results = useInfiniteQuery({
    queryKey: ["report-vehicles", branchId, q, value],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ q, limit: "25" });
      if (branchId) params.set("branchId", branchId);
      if (pageParam) params.set("cursor", pageParam);
      if (value) params.set("selectedIds", value);
      return apiGet<Page>("/reports/vehicle-options?" + params);
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const vehicles = [
    ...new Map(
      (
        results.data?.pages.flatMap((p) => [...p.selected, ...p.vehicles]) ?? []
      ).map((v) => [v.id, v]),
    ).values(),
  ];
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-1.5 text-sm font-semibold">Vehicle</legend>
      <input
        aria-label="Search vehicles by VIN or registration"
        placeholder="Search VIN or registration…"
        className={inputCls}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!value}
          onChange={(e) =>
            onChange(e.target.checked ? "" : (vehicles[0]?.id ?? ""))
          }
        />
        All vehicles
      </label>
      <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
        {vehicles.map((v) => (
          <label key={v.id} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={ids.includes(v.id)}
              disabled={ids.length >= 100 && !ids.includes(v.id)}
              onChange={(e) =>
                onChange(
                  (e.target.checked
                    ? [...ids, v.id]
                    : ids.filter((id) => id !== v.id)
                  ).join(","),
                )
              }
            />
            <span className="break-all">
              {v.registrationNumber ?? "No registration"} · {v.vin}
            </span>
          </label>
        ))}
        {results.isPending && (
          <p className="text-sm" role="status">
            Loading vehicles…
          </p>
        )}
        {!results.isPending && !vehicles.length && (
          <p className="text-sm">No matching vehicles.</p>
        )}
        {results.isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load vehicles.{" "}
            <button type="button" onClick={() => results.refetch()}>
              Retry
            </button>
          </p>
        )}
      </div>
      {results.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={results.isFetchingNextPage}
          onClick={() => results.fetchNextPage()}
        >
          Load more vehicles
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        {ids.length
          ? `${ids.length} selected (maximum 100)`
          : "All authorized vehicles. Search to select specific vehicles."}
      </p>
    </fieldset>
  );
}
