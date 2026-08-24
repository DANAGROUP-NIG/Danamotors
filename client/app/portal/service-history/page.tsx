"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/headers/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, SimpleTable } from "@/features/customer-portal/components/portal-ui";
import { StatusBadge } from "@/features/customer-portal/components/StatusBadge";
import { usePortalJobCards } from "@/features/customer-portal/hooks/use-portal";
import { formatDate } from "@/features/customer-portal/lib/format";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = ["All", "Open", "In Progress", "Pending", "Completed", "Closed"];

export default function PortalServiceHistoryPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const { data, isLoading } = usePortalJobCards({ status });

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Service History"
        description="All job cards and estimates across your vehicles"
      />

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-white p-1">
        {STATUS_FILTERS.map((s) => {
          const active = (status ?? "All") === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s === "All" ? undefined : s)}
              className={cn(
                "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {s}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : data && data.length > 0 ? (
        <SimpleTable
          headers={["Job", "Vehicle", "Description", "Status", "Date"]}
          rows={data.map((job) => [
            <Link
              key={job.id}
              href={`/portal/service-history/${job.id}`}
              className="font-semibold text-primary hover:underline"
            >
              {job.jobNumber}
            </Link>,
            job.vehicle
              ? `${job.vehicle.make ?? ""} ${job.vehicle.model ?? ""}`.trim() ||
                (job.vehicle.registrationNumber ?? "—")
              : "—",
            <span key={`d-${job.id}`} className="line-clamp-1 max-w-[260px]">
              {job.description}
            </span>,
            <StatusBadge key={`s-${job.id}`} status={job.status} />,
            formatDate(job.createdAt),
          ])}
        />
      ) : (
        <Card>
          <CardContent className="p-5">
            <EmptyState
              message={
                status
                  ? `No ${status.toLowerCase()} jobs found`
                  : "No service history yet"
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
