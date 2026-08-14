"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState, SimpleTable } from "@/features/customer-portal/components/portal-ui";
import { StatusBadge } from "@/features/customer-portal/components/StatusBadge";
import { EstimateApprovalActions } from "@/features/customer-portal/components/EstimateApprovalActions";
import { usePortalJobCard } from "@/features/customer-portal/hooks/use-portal";
import { formatCurrency, formatDate, formatDateTime } from "@/features/customer-portal/lib/format";

export default function PortalServiceHistoryDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: job, isLoading } = usePortalJobCard(params.id);

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      </div>
    );
  }

  if (!job) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title={job.jobNumber}
          description={`${job.vehicle ? `${job.vehicle.make ?? ""} ${job.vehicle.model ?? ""}`.trim() : "Vehicle"} · ${job.branch?.name ?? ""}`}
        />
        <Button variant="outline" size="sm" asChild>
          <Link href="/portal/service-history">Back to service history</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Job summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge status={job.status} />
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">Progress</dt>
                <dd className="font-medium">{job.progress != null ? `${job.progress}%` : "—"}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">Quality check</dt>
                <dd className="font-medium">{job.qcStatus ?? "—"}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">Technician</dt>
                <dd className="font-medium">
                  {job.technician
                    ? `${job.technician.firstName} ${job.technician.lastName}`
                    : "—"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">Branch</dt>
                <dd className="font-medium">{job.branch?.name ?? "—"}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">Opened</dt>
                <dd className="font-medium">{formatDate(job.createdAt)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">Last updated</dt>
                <dd className="font-medium">{formatDateTime(job.updatedAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{job.description}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estimates</CardTitle>
        </CardHeader>
        <CardContent>
          {job.estimates.length > 0 ? (
            <SimpleTable
              headers={["Estimate", "Amount", "Status", "Action"]}
              rows={job.estimates.map((est) => [
                <span key={est.id} className="max-w-[280px]">
                  {est.description}
                </span>,
                formatCurrency(est.amount),
                <StatusBadge key={`s-${est.id}`} status={est.status} />,
                <EstimateApprovalActions key={`a-${est.id}`} estimate={est} />,
              ])}
            />
          ) : (
            <EmptyState message="No estimates for this job yet" />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {job.invoices.length > 0 ? (
              <SimpleTable
                headers={["Invoice", "Status", "Total"]}
                rows={job.invoices.map((inv) => [
                  <Link
                    key={inv.id}
                    href={`/portal/invoices/${inv.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {inv.invoiceNumber}
                  </Link>,
                  <StatusBadge key={`s-${inv.id}`} status={inv.status} />,
                  formatCurrency(inv.total),
                ])}
              />
            ) : (
              <EmptyState message="No invoices for this job" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inspections</CardTitle>
          </CardHeader>
          <CardContent>
            {job.inspections.length > 0 ? (
              <SimpleTable
                headers={["Findings", "Status", "Passed"]}
                rows={job.inspections.map((inspection) => [
                  <span key={inspection.id} className="max-w-[240px]">
                    {inspection.findings}
                  </span>,
                  <StatusBadge key={`s-${inspection.id}`} status={inspection.status} />,
                  inspection.passed == null ? "—" : inspection.passed ? "Yes" : "No",
                ])}
              />
            ) : (
              <EmptyState message="No inspections recorded" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
