"use client";

import { useState } from "react";
import { Plus, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import ModalFame from "@/components/modals/ModalFame";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useUsers } from "../hooks/use-users";
import { UserCreateForm } from "./UserCreateForm";
import { UsersTable } from "./UsersTable";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";

function exportColumns() {
  return [
    { key: "firstName", label: "First Name" },
    { key: "lastName", label: "Last Name" },
    { key: "email", label: "Email" },
    { key: "phoneNumber", label: "Phone" },
    { key: "role", label: "Role" },
    { key: "branch", label: "Branch" },
    { key: "isActive", label: "Active" },
  ];
}

function ExportUsersButton() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const branchId = activeBranch?.id ?? undefined;
  const { data } = useUsers({ page: 1, limit: 1000, branchId });
  const users = data?.users ?? [];
  const disabled = users.length === 0;

  function filename() {
    return `dana-motors-users-${new Date().toISOString().split("T")[0]}`;
  }

  function exportRows() {
    return users.map((u) => ({
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phoneNumber: u.phoneNumber ?? "",
      role: u.role?.name ?? "",
      branch: u.branch?.name ?? "",
      isActive: u.isActive ? "Yes" : "No",
    }));
  }

  return (
    <ActionMenu
      align="end"
      trigger={
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-9 gap-1.5"
        >
          <Download className="size-4" />
          Export
        </Button>
      }
    >
      <ActionMenuItem
        icon={<Download className="size-4" />}
        onClick={() =>
          downloadCsv(filename(), exportRows(), exportColumns())
        }
      >
        Export as CSV
      </ActionMenuItem>
      <ActionMenuItem
        icon={<FileSpreadsheet className="size-4" />}
        onClick={() =>
          downloadExcel(filename(), exportRows(), exportColumns())
        }
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

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
          <div className="flex items-center gap-2">
            <ExportUsersButton />
            {canCreate && (
              <Button onClick={() => setShowForm(true)} size="sm">
                <Plus className="size-4" />
                Add user
              </Button>
            )}
          </div>
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
