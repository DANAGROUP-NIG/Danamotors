"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useAppointments } from "../hooks/use-appointments";
import { AppointmentCreateForm } from "./AppointmentCreateForm";
import { AppointmentsTable } from "./AppointmentsTable";

export function AppointmentsPage() {
  const [showForm, setShowForm] = useState(false);
  const { data } = useAppointments({ page: 1, pageSize: 1 });

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Appointments"
        description={
          data?.total != null
            ? `${data.total} ${data.total === 1 ? "appointment" : "appointments"} on record`
            : undefined
        }
        actions={
          <Button
            onClick={() => setShowForm((v) => !v)}
            variant={showForm ? "outline" : "default"}
            size="sm"
          >
            {showForm ? (
              <><X className="size-4" />Cancel</>
            ) : (
              <><Plus className="size-4" />Book appointment</>
            )}
          </Button>
        }
      />

      {showForm && <AppointmentCreateForm onSuccess={() => setShowForm(false)} />}
      <AppointmentsTable />
    </div>
  );
}
