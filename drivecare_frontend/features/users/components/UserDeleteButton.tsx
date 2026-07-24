"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { useDeleteUser } from "../hooks/use-delete-user";
import type { User } from "../types/user.types";

interface UserDeleteButtonProps {
  user: User;
  onSuccess?: () => void;
}

export function UserDeleteButton({ user, onSuccess }: UserDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const del = useDeleteUser();

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
        aria-label={`Delete ${user.firstName} ${user.lastName}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <ConfirmDeleteModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={() =>
          del.mutate(user.id, {
            onSuccess: () => {
              setOpen(false);
              onSuccess?.();
            },
          })
        }
        title="Delete user"
        message={`Are you sure you want to delete ${user.firstName} ${user.lastName}? This action cannot be undone.`}
        isPending={del.isPending}
      />
    </>
  );
}
