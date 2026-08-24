"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState, SimpleTable } from "@/features/customer-portal/components/portal-ui";
import { StatusBadge } from "@/features/customer-portal/components/StatusBadge";
import { usePortalVehicle } from "@/features/customer-portal/hooks/use-portal";
import { formatDate } from "@/features/customer-portal/lib/format";

export default function PortalVehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: vehicle, isLoading } = usePortalVehicle(params.id);

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      </div>
    );
  }

  if (!vehicle) {
    notFound();
  }

  const details: { label: string; value: string }[] = [
    { label: "Make", value: vehicle.make ?? "—" },
    { label: "Model", value: vehicle.model ?? "—" },
    { label: "Year", value: vehicle.year ? String(vehicle.year) : "—" },
    { label: "Trim", value: vehicle.trim ?? "—" },
    { label: "Color", value: vehicle.color ?? "—" },
    { label: "VIN", value: vehicle.vin ?? "—" },
    {
      label: "Registration",
      value: vehicle.registrationNumber ?? "—",
    },
    {
      label: "Warranty provider",
      value: vehicle.warrantyProvider ?? "—",
    },
    {
      label: "Warranty status",
      value: vehicle.warrantyStatus ?? "—",
    },
    {
      label: "Warranty expiry",
      value: vehicle.warrantyExpiresAt ? formatDate(vehicle.warrantyExpiresAt) : "—",
    },
    {
      label: "Ownership",
      value: vehicle.ownershipStatus ?? "—",
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title={`${vehicle.make} ${vehicle.model}`}
          description={`${vehicle.year ?? ""} · ${vehicle.registrationNumber ?? "No registration"}`}
        />
        <Button variant="outline" size="sm" asChild>
          <Link href="/portal/vehicles">Back to vehicles</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Vehicle details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 text-sm">
              {details.map((d) => (
                <div key={d.label} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-muted-foreground">{d.label}</dt>
                  <dd className="text-right font-medium">{d.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Service history</CardTitle>
          </CardHeader>
          <CardContent>
            {vehicle.jobCards.length > 0 ? (
              <SimpleTable
                headers={["Job", "Status", "Estimated cost", "Date"]}
                rows={vehicle.jobCards.map((job) => [
                  <Link
                    key={job.id}
                    href={`/portal/service-history/${job.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {job.jobNumber}
                  </Link>,
                  <StatusBadge key={`s-${job.id}`} status={job.status} />,
                  job.estimatedCost != null
                    ? new Intl.NumberFormat(undefined, {
                        style: "currency",
                        currency: "USD",
                      }).format(job.estimatedCost)
                    : "—",
                  formatDate(job.createdAt),
                ])}
              />
            ) : (
              <EmptyState message="No service jobs for this vehicle yet" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
