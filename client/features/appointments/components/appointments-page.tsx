"use client";

import { useState } from "react";
import { Plus, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranchStore } from "@/store/branch.store";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";
import { AppointmentsTable } from "./AppointmentsTable";
import { AppointmentCreateForm } from "./AppointmentCreateForm";
import { useAppointments } from "../hooks/use-appointments";
import type { Appointment } from "../types/appointment.types";

function toExportRow(a: Appointment): Record<string, string | number | boolean | null | undefined> {
  const vehicle = a.vehicle as Record<string, unknown> | null | undefined;
  return {
    customer: a.customer ? `${a.customer.firstName} ${a.customer.lastName}` : "",
    vehicleRegNo: vehicle?.registrationNumber ? String(vehicle.registrationNumber) : "",
    branch: a.branch?.name ?? "",
    scheduledAt: new Date(a.scheduledAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    status: a.status,
    source: a.source,
    notes: a.notes ?? "",
    agent: a.createdBy ? `${a.createdBy.firstName} ${a.createdBy.lastName}` : "",
  };
}

function exportColumns() {
  return [
    { key: "customer", label: "Customer" },
    { key: "vehicleRegNo", label: "Vehicle Reg No" },
    { key: "branch", label: "Branch" },
    { key: "scheduledAt", label: "Scheduled" },
    { key: "status", label: "Status" },
    { key: "source", label: "Source" },
    { key: "notes", label: "Notes" },
    { key: "agent", label: "Agent" },
  ];
}

function ExportAppointmentsButton() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { data } = useAppointments({
    page: 1,
    limit: 1000,
    branchId: activeBranch?.id ?? undefined,
  });
  const appointments = data?.appointments ?? [];
  const disabled = appointments.length === 0;

  function filename() {
    return `dana-motors-appointments-${new Date().toISOString().split("T")[0]}`;
  }

  return (
    <ActionMenu
      align="end"
      trigger={
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-9 gap-1.5"
        >
          <Download className="size-4" />
          Export
        </Button>
      }
    >
      <ActionMenuItem
        icon={<Download className="size-4" />}
        onClick={() =>
          downloadCsv(filename(), appointments.map(toExportRow), exportColumns())
        }
      >
        Export as CSV
      </ActionMenuItem>
      <ActionMenuItem
        icon={<FileSpreadsheet className="size-4" />}
        onClick={() =>
          downloadExcel(filename(), appointments.map(toExportRow), exportColumns())
        }
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

export function AppointmentsPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { hasPermission } = useAuth();
  const canCreate = hasPermission("appointment:create");

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Service Appointments
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage service appointments and walk-in bookings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportAppointmentsButton />
          {canCreate && (
            <Button
              id="appointment-create-btn"
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Plus className="size-4" />
              New Walk-in
            </Button>
          )}
        </div>
      </div>

      <AppointmentsTable />

      {/* ── Walk-in Creation Modal ───────────────────────────────────────── */}
      <ModalFame
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Book Walk-in Appointment"
      >
        <AppointmentCreateForm onSuccess={() => setIsCreateModalOpen(false)} />
      </ModalFame>
    </div>
  );
}
