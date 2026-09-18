"use client";

import { useState } from "react";
import { Plus, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";

import ModalFame from "@/components/modals/ModalFame";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { useServices } from "../hooks/use-services";
import { ServiceCreateForm } from "./ServiceCreateForm";
import { ServicesTable } from "./ServicesTable";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";

function exportColumns() {
  return [
    { key: "name", label: "Name" },
    { key: "category", label: "Category" },
    { key: "durationMins", label: "Duration (mins)" },
    { key: "price", label: "Price" },
    { key: "appointmentsCount", label: "Bookings" },
    { key: "isActive", label: "Active" },
  ];
}

function ExportServicesButton() {
  const { data } = useServices({ page: 1, limit: 1000 });
  const services = data?.services ?? [];
  const disabled = services.length === 0;

  function filename() {
    return `dana-motors-services-${new Date().toISOString().split("T")[0]}`;
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
          downloadCsv(
            filename(),
            services as unknown as Record<string, string | number | boolean | null | undefined>[],
            exportColumns(),
          )
        }
      >
        Export as CSV
      </ActionMenuItem>
      <ActionMenuItem
        icon={<FileSpreadsheet className="size-4" />}
        onClick={() =>
          downloadExcel(
            filename(),
            services as unknown as Record<string, string | number | boolean | null | undefined>[],
            exportColumns(),
          )
        }
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

export function ServicesPage() {
  const [showForm, setShowForm] = useState(false);
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("services:create");
  const { data } = useServices({ page: 1, limit: 1 });

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Services"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "service" : "services"} on record`
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <ExportServicesButton />
            {canCreate && (
              <Button onClick={() => setShowForm(true)} size="sm">
                <Plus className="size-4" />
                Add service
              </Button>
            )}
          </div>
        }
      />

      <ModalFame
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Add service"
      >
        <ServiceCreateForm onSuccess={() => setShowForm(false)} />
      </ModalFame>
      <ServicesTable />
    </div>
  );
}
