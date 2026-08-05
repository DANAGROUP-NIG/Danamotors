"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { useDeleteAppointment } from "../hooks/use-delete-appointment";
import type { Appointment } from "../types/appointment.types";

interface AppointmentDeleteButtonProps {
  appointment: Appointment;
  onSuccess?: () => void;
}

export function AppointmentDeleteButton({
  appointment,
  onSuccess,
}: AppointmentDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const del = useDeleteAppointment();

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
        aria-label="Delete appointment"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <ConfirmDeleteModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={() =>
          del.mutate(appointment.id, {
            onSuccess: () => {
              setOpen(false);
              onSuccess?.();
            },
          })
        }
        title="Delete appointment"
        message="Are you sure you want to delete this appointment? This action cannot be undone."
        isPending={del.isPending}
      />
    </>
  );
}
