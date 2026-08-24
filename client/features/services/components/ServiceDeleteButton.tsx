"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { useDeleteService } from "../hooks/use-delete-service";
import type { ServiceItem } from "../types/service-catalog.types";

interface ServiceDeleteButtonProps {
  service: ServiceItem;
  onSuccess?: () => void;
}

export function ServiceDeleteButton({
  service,
  onSuccess,
}: ServiceDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const del = useDeleteService();

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
        aria-label={`Delete ${service.name}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <ConfirmDeleteModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={() =>
          del.mutate(service.id, {
            onSuccess: () => {
              setOpen(false);
              onSuccess?.();
            },
          })
        }
        title="Delete service"
        message={`Are you sure you want to delete ${service.name}? Past bookings will keep their records but will no longer reference this service. This action cannot be undone.`}
        isPending={del.isPending}
      />
    </>
  );
}
