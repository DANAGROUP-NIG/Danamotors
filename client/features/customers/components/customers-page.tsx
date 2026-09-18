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
import { useCustomers } from "../hooks/use-customers";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";
import { CustomerCreateForm } from "./CustomerCreateForm";
import { CustomersTable } from "./CustomersTable";

function exportColumns() {
  return [
    { key: "firstName", label: "First Name" },
    { key: "lastName", label: "Last Name" },
    { key: "email", label: "Email" },
    { key: "phoneNumber", label: "Phone" },
    { key: "address", label: "Address" },
    { key: "city", label: "City" },
    { key: "state", label: "State" },
    { key: "country", label: "Country" },
  ];
}

function ExportCustomersButton() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { data } = useCustomers({ page: 1, limit: 1000, branchId: activeBranch?.id });
  const customers = data?.customers ?? [];
  const disabled = customers.length === 0;

  function filename() {
    return `dana-motors-customers-${new Date().toISOString().split("T")[0]}`;
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
            customers as unknown as Record<string, string | number | boolean | null | undefined>[],
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
            customers as unknown as Record<string, string | number | boolean | null | undefined>[],
            exportColumns(),
          )
        }
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

export function CustomersPage() {
  const [showForm, setShowForm] = useState(false);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("customer:create");
  const { data } = useCustomers({
    page: 1,
    limit: 1,
    branchId: activeBranch?.id,
  });

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Customers"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "customer" : "customers"} on record`
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <ExportCustomersButton />
            {canCreate && (
              <Button onClick={() => setShowForm(true)} size="sm">
                <Plus className="size-4" />
                Add customer
              </Button>
            )}
          </div>
        }
      />

      <ModalFame
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Add customer"
      >
        <CustomerCreateForm onSuccess={() => setShowForm(false)} />
      </ModalFame>
      <CustomersTable />
    </div>
  );
}
