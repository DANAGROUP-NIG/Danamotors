"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useBranchStore } from "@/store/branch.store";
import { useCustomers } from "../hooks/use-customers";
import { CustomerCreateForm } from "./CustomerCreateForm";
import { CustomersTable } from "./CustomersTable";

export function CustomersPage() {
  const [showForm, setShowForm] = useState(false);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { data } = useCustomers({ page: 1, limit: 1, branchId: activeBranch?.id });

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
          <Button
            onClick={() => setShowForm((v) => !v)}
            variant={showForm ? "outline" : "default"}
            size="sm"
          >
            {showForm ? (
              <><X className="size-4" />Cancel</>
            ) : (
              <><Plus className="size-4" />Add customer</>
            )}
          </Button>
        }
      />

      {showForm && <CustomerCreateForm onSuccess={() => setShowForm(false)} />}
      <CustomersTable />
    </div>
  );
}
