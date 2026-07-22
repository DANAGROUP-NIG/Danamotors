"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useAppointments } from "../hooks/use-appointments";
import { AppointmentCreateForm } from "./AppointmentCreateForm";
import { AppointmentsTable } from "./AppointmentsTable";

export function AppointmentsPage() {
  const [showForm, setShowForm] = useState(false);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { isSuperAdmin } = useAuth();
  const branchId = isSuperAdmin
    ? (activeBranch?.id ?? undefined)
    : (activeBranch?.id ?? undefined);
  const { data } = useAppointments({ page: 1, limit: 1, branchId });

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Appointments"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "appointment" : "appointments"} on record`
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
