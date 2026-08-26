"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import ModalFame from "@/components/modals/ModalFame";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useUsers } from "../hooks/use-users";
import { UserCreateForm } from "./UserCreateForm";
import { UsersTable } from "./UsersTable";

export function UsersPage() {
  const [showForm, setShowForm] = useState(false);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("user:create");
  const branchId = activeBranch?.id ?? undefined;
  const { data } = useUsers({ page: 1, limit: 1, branchId });

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Users"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "user" : "users"} on record`
            : undefined
        }
        actions={
          canCreate && (
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="size-4" />
              Add user
            </Button>
          )
        }
      />

      <ModalFame
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Add user"
      >
        <UserCreateForm onSuccess={() => setShowForm(false)} />
      </ModalFame>
      <UsersTable />
    </div>
  );
}
