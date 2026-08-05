"use client";

import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  isPending?: boolean;
}

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  isPending,
}: ConfirmDeleteModalProps) {
  return (
    <ModalFame isOpen={isOpen} onClose={onClose} title={title}>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="bg-red-600 text-white hover:bg-red-700"
          onClick={onConfirm}
          disabled={isPending}
        >
          {isPending ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </ModalFame>
  );
}
