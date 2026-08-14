"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import {
  EmptyState,
  SimpleTable,
} from "@/features/customer-portal/components/portal-ui";
import { StatusBadge } from "@/features/customer-portal/components/StatusBadge";
import { BookAppointmentForm } from "@/features/customer-portal/components/BookAppointmentForm";
import { usePortalAppointments } from "@/features/customer-portal/hooks/use-portal";
import { formatDateTime } from "@/features/customer-portal/lib/format";

export default function PortalAppointmentsPage() {
  const { data, isLoading } = usePortalAppointments();
  const [isBooking, setIsBooking] = useState(false);

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Appointments"
        description="Your scheduled workshop visits"
        actions={
          <Button onClick={() => setIsBooking(true)}>
            <Plus className="size-4" />
            Book appointment
          </Button>
        }
      />

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : data && data.length > 0 ? (
        <SimpleTable
          headers={["Date & time", "Vehicle", "Status", "Branch", "Notes"]}
          rows={data.map((appt) => [
            formatDateTime(appt.scheduledAt),
            appt.vehicle
              ? `${appt.vehicle.make ?? ""} ${appt.vehicle.model ?? ""}`.trim() ||
                (appt.vehicle.registrationNumber ?? "—")
              : "—",
            <StatusBadge key={`s-${appt.id}`} status={appt.status} />,
            appt.branch?.name ?? "—",
            appt.notes ?? "—",
          ])}
        />
      ) : (
        <Card>
          <CardContent className="p-5">
            <EmptyState
              message="No appointments yet. Book your first visit below."
              action={
                <Button onClick={() => setIsBooking(true)}>
                  <Plus className="size-4" />
                  Book appointment
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      <ModalFame
        isOpen={isBooking}
        onClose={() => setIsBooking(false)}
        title="Book an appointment"
      >
        <BookAppointmentForm onSuccess={() => setIsBooking(false)} />
      </ModalFame>
    </div>
  );
}
