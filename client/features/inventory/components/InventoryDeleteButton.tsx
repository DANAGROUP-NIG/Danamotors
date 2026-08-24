"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { useDeleteInventoryItem } from "../hooks/use-delete-inventory-item";
import type { InventoryItem } from "../types/inventory.types";

interface InventoryDeleteButtonProps {
  item: InventoryItem;
  onSuccess?: () => void;
}

export function InventoryDeleteButton({ item, onSuccess }: InventoryDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const del = useDeleteInventoryItem();

  return (
    <>
      <Button
        size="sm" variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
        aria-label={`Remove ${item.name}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <ConfirmDeleteModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={() =>
          del.mutate(item.id, {
            onSuccess: () => {
              setOpen(false);
              onSuccess?.();
            },
          })
        }
        title="Delete inventory item"
        message={`Are you sure you want to delete ${item.name}? This action cannot be undone.`}
        isPending={del.isPending}
      />
    </>
  );
}
