"use client";

import { useState } from "react";
import { Plus, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import ModalFame from "@/components/modals/ModalFame";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { useBranches } from "../hooks/use-branches";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { BranchCreateForm } from "./BranchCreateForm";
import { BranchesTable } from "./BranchesTable";

function exportColumns() {
  return [
    { key: "name", label: "Name" },
    { key: "city", label: "City" },
    { key: "state", label: "State" },
    { key: "phoneNumber", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "usersCount", label: "Users" },
    { key: "isActive", label: "Active" },
  ];
}

function ExportBranchesButton() {
  const { data } = useBranches({ page: 1, limit: 1000 });
  const branches = data?.branches ?? [];
  const disabled = branches.length === 0;

  function filename() {
    return `dana-motors-branches-${new Date().toISOString().split("T")[0]}`;
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
          downloadCsv(
            filename(),
            branches as unknown as Record<string, string | number | boolean | null | undefined>[],
            exportColumns(),
          )
        }
      >
        Export as CSV
      </ActionMenuItem>
      <ActionMenuItem
        icon={<FileSpreadsheet className="size-4" />}
        onClick={() =>
          downloadExcel(
            filename(),
            branches as unknown as Record<string, string | number | boolean | null | undefined>[],
            exportColumns(),
          )
        }
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

export function BranchesPage() {
  const [showForm, setShowForm] = useState(false);
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("branch:create");
  const { data } = useBranches({ page: 1, limit: 1 });

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Branches"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "branch" : "branches"} on record`
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <ExportBranchesButton />
            {canCreate && (
              <Button onClick={() => setShowForm(true)} size="sm">
                <Plus className="size-4" />
                Add branch
              </Button>
            )}
          </div>
        }
      />

      <ModalFame
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Add branch"
      >
        <BranchCreateForm onSuccess={() => setShowForm(false)} />
      </ModalFame>
      <BranchesTable />
    </div>
  );
}
