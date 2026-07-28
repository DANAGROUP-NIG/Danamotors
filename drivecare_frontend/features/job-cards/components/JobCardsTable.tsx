"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DELETE_ROLES } from "@/features/auth/roles";
import { useJobCards } from "../hooks/use-job-cards";
import type { JobCard } from "../types/job-card.types";

const PAGE_SIZE = 10;

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  on_hold: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
};

export function JobCardsTable() {
  const [page, setPage] = useState(1);

  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canDelete = hasAccess(DELETE_ROLES);

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id]);

  const { data, isLoading, isError, isFetching } = useJobCards({
    page,
    limit: PAGE_SIZE,
    branchId: activeBranch?.id,
  });

  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-red-500">
            Failed to load job cards. Check the API connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-xl border border-[#e8edf3] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e8edf3] bg-[#f8fafc]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Job #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Vehicle</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Branch</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Agent</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Progress</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows />
              ) : !data?.jobCards?.length ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    No job cards yet. They will appear here once created.
                  </td>
                </tr>
              ) : (
                data.jobCards.map((jobCard) => (
                  <JobCardRow key={jobCard.id} jobCard={jobCard} />
                ))
              )}
            </tbody>
          </table>
        </div>

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

function JobCardRow({ jobCard }: { jobCard: JobCard }) {
  const router = useRouter();
  const vehicleLabel = `${jobCard.vehicle.year} ${jobCard.vehicle.make} ${jobCard.vehicle.model}`;
  const customerName = `${jobCard.customer.firstName} ${jobCard.customer.lastName}`;
  const statusClass = STATUS_STYLES[jobCard.status] ?? "bg-gray-100 text-gray-600";

  return (
    <tr
      className="cursor-pointer border-t border-border transition-colors hover:bg-muted/30"
      onClick={() => router.push(`/job-cards/${jobCard.id}`)}
    >
      <td className="px-4 py-3 font-medium">{jobCard.jobNumber}</td>
      <td className="px-4 py-3 text-muted-foreground">{vehicleLabel}</td>
      <td className="px-4 py-3 text-muted-foreground">{customerName}</td>
      <td className="px-4 py-3 text-muted-foreground">{jobCard.branch.name}</td>
      <td className="px-4 py-3 text-muted-foreground">
        {jobCard.createdBy ? jobCard.createdBy.firstName : <span className="text-border">—</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${jobCard.progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{jobCard.progress}%</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
            statusClass,
          )}
        >
          {jobCard.status.replace("_", " ")}
        </span>
      </td>
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
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-36 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
          </td>
        </tr>
      ))}
    </>
  );
}
