"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";

import ModalFame from "@/components/modals/ModalFame";
import { useServices } from "../hooks/use-services";
import { ServiceCreateForm } from "./ServiceCreateForm";
import { ServicesTable } from "./ServicesTable";

export function ServicesPage() {
  const [showForm, setShowForm] = useState(false);
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
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="size-4" />
            Add service
          </Button>
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
