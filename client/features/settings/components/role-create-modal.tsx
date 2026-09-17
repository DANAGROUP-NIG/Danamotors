"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { useCreateRole } from "../hooks/use-admin-roles";

export function RoleCreateModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const createRole = useCreateRole();

  function handleSubmit() {
    if (!name.trim()) return;

    createRole.mutate(
      { name: name.trim(), description: description.trim() || undefined, permissions: [] },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          onClose();
        },
      },
    );
  }

  return (
    <ModalFame isOpen={open} onClose={onClose} title="Create role">
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium text-foreground">
          Role Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 rounded-lg border border-[#e8edf3] bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. Sales Manager"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="min-h-24 rounded-lg border border-[#e8edf3] bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="Optional role description"
          />
        </label>

        <Button onClick={handleSubmit} disabled={!name.trim() || createRole.isPending}>
          {createRole.isPending ? "Creating…" : "Create role"}
        </Button>
      </div>
    </ModalFame>
  );
}
