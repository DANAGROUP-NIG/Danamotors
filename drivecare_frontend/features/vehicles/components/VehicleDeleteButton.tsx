"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeleteVehicle } from "../hooks/use-delete-vehicle";
import type { Vehicle } from "../types/vehicle.types";

interface VehicleDeleteButtonProps {
  vehicle: Vehicle;
  onSuccess?: () => void;
}

export function VehicleDeleteButton({ vehicle, onSuccess }: VehicleDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const del = useDeleteVehicle();

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Remove?</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
          disabled={del.isPending}
          onClick={() =>
            del.mutate(vehicle.id, {
              onSuccess: () => { setConfirming(false); onSuccess?.(); },
              onError: () => setConfirming(false),
            })
          }
        >
          {del.isPending ? "…" : "Yes"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirming(false)} disabled={del.isPending}>
          No
        </Button>
      </span>
    );
  }

  return (
    <Button
      size="sm" variant="ghost"
      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
      aria-label={`Remove ${vehicle.make} ${vehicle.model}`}
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
