"use client";

import { useState } from "react";
import Link from "next/link";
import { Car, Plus, Wrench } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import {
  EmptyState,
  SimpleTable,
} from "@/features/customer-portal/components/portal-ui";
import { StatusBadge } from "@/features/customer-portal/components/StatusBadge";
import { RegisterVehicleForm } from "@/features/customer-portal/components/RegisterVehicleForm";
import { usePortalVehicles } from "@/features/customer-portal/hooks/use-portal";
import { formatDate } from "@/features/customer-portal/lib/format";

export default function PortalVehiclesPage() {
  const { data, isLoading } = usePortalVehicles();
  const [isRegistering, setIsRegistering] = useState(false);

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="My Vehicles"
        description="Vehicles registered to your customer account"
        actions={
          <Button onClick={() => setIsRegistering(true)}>
            <Plus className="size-4" />
            Register vehicle
          </Button>
        }      />

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : data && data.length > 0 ? (
        <SimpleTable
          headers={["Vehicle", "Registration", "Status", "Last job", "Jobs"]}
          rows={data.map((v) => [
            <Link
              key={v.id}
              href={`/portal/vehicles/${v.id}`}
              className="inline-flex items-center gap-2 font-semibold text-primary hover:underline"
            >
              <Car className="size-4" />
              {v.make} {v.model} {v.year ? `(${v.year})` : ""}
            </Link>,
            v.registrationNumber ?? "—",
            v.warrantyStatus ? (
              <StatusBadge key={`w-${v.id}`} status={v.warrantyStatus} />
            ) : (
              "—"
            ),
            v.latestJobCard
              ? `${v.latestJobCard.jobNumber} · ${formatDate(v.latestJobCard.createdAt)}`
              : "—",
            <span
              key={`c-${v.id}`}
              className="inline-flex items-center gap-1 text-muted-foreground"
            >
              <Wrench className="size-3.5" />
              {v.jobCardCount}
            </span>,
          ])}
        />
      ) : (
        <Card>
          <CardContent className="p-5">
            <EmptyState
              message="No vehicles found. Register your first vehicle below."
              action={
                <Button onClick={() => setIsRegistering(true)}>
                  <Plus className="size-4" />
                  Register vehicle
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      <ModalFame
        isOpen={isRegistering}
        onClose={() => setIsRegistering(false)}
        title="Register a vehicle"
      >
        <RegisterVehicleForm onSuccess={() => setIsRegistering(false)} />
      </ModalFame>
    </div>
  );
}
