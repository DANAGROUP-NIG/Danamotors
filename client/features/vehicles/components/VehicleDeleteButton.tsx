"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { useDeleteVehicle } from "../hooks/use-delete-vehicle";
import type { Vehicle } from "../types/vehicle.types";

interface VehicleDeleteButtonProps {
  vehicle: Vehicle;
  onSuccess?: () => void;
}

export function VehicleDeleteButton({ vehicle, onSuccess }: VehicleDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const del = useDeleteVehicle();

  return (
    <>
      <Button
        size="sm" variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
        aria-label={`Remove ${vehicle.make} ${vehicle.model}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <ConfirmDeleteModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={() =>
          del.mutate(vehicle.id, {
            onSuccess: () => {
              setOpen(false);
              onSuccess?.();
            },
          })
        }
        title="Delete vehicle"
        message={`Are you sure you want to delete ${vehicle.make} ${vehicle.model}? This action cannot be undone.`}
        isPending={del.isPending}
      />
    </>
  );
}
