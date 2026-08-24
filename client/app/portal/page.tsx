"use client";

import Link from "next/link";
import { Car, Wrench, CheckCircle2, CalendarClock, Wallet } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import {
  EmptyState,
  PortalSection,
  SimpleTable,
  StatCard,
} from "@/features/customer-portal/components/portal-ui";
import { StatusBadge } from "@/features/customer-portal/components/StatusBadge";
import { usePortalDashboard } from "@/features/customer-portal/hooks/use-portal";
import {
  formatCurrency,
  formatDate,
} from "@/features/customer-portal/lib/format";

export default function PortalDashboardPage() {
  const { data, isLoading } = usePortalDashboard();

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Dashboard"
        description="An overview of your vehicles, service and bills"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Available Credit"
          value={formatCurrency(data?.creditBalance)}
          hint={
            (data?.pendingCreditCount ?? 0) > 0
              ? `${data?.pendingCreditCount} pending application${
                  data?.pendingCreditCount === 1 ? "" : "s"
                }`
              : undefined
          }
          icon={Wallet}
          href="/portal/credit"
        />
        <StatCard
          label="My Vehicles"
          value={data?.vehicleCount ?? 0}
          icon={Car}
          href="/portal/vehicles"
        />
        <StatCard
          label="Active Jobs"
          value={data?.activeJobCount ?? 0}
          icon={Wrench}
          href="/portal/service-history"
        />
        <StatCard
          label="Completed Jobs"
          value={data?.completedJobCount ?? 0}
          icon={CheckCircle2}
        />
        <StatCard
          label="Upcoming Appointments"
          value={data?.upcomingAppointments ?? 0}
          icon={CalendarClock}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PortalSection
            title="Recent service jobs"
            href="/portal/service-history"
          >
            {isLoading ? (
              <p className="py-6 text-sm text-muted-foreground">Loading…</p>
            ) : data?.recentJobCards?.length ? (
              <SimpleTable
                headers={["Job", "Vehicle", "Status", "Date"]}
                rows={data.recentJobCards.map((job) => [
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
                  <StatusBadge key={`s-${job.id}`} status={job.status} />,
                  formatDate(job.createdAt),
                ])}
              />
            ) : (
              <EmptyState message="No service jobs yet" />
            )}
          </PortalSection>
        </div>

        <div>
          <PortalSection title="Outstanding balance" href="/portal/invoices">
            {isLoading ? (
              <p className="py-6 text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <Wallet className="size-10 text-muted-foreground" />
                <p className="text-3xl font-bold text-primary">
                  {formatCurrency(data?.outstandingTotal)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Unpaid & partially paid invoices
                </p>
              </div>
            )}
          </PortalSection>
        </div>
      </div>

      <PortalSection title="Recent invoices" href="/portal/invoices">
        {isLoading ? (
          <p className="py-6 text-sm text-muted-foreground">Loading…</p>
        ) : data?.recentInvoices?.length ? (
          <SimpleTable
            headers={["Invoice", "Job", "Status", "Total", "Issued"]}
            rows={data.recentInvoices.map((inv) => [
              <Link
                key={inv.id}
                href={`/portal/invoices/${inv.id}`}
                className="font-semibold text-primary hover:underline"
              >
                {inv.invoiceNumber}
              </Link>,
              inv.jobCard?.jobNumber ?? "—",
              <StatusBadge key={`s-${inv.id}`} status={inv.status} />,
              formatCurrency(inv.total),
              formatDate(inv.issuedDate),
            ])}
          />
        ) : (
          <EmptyState message="No invoices yet" />
        )}
      </PortalSection>
    </div>
  );
}
