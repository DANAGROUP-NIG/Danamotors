"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import ModalFame from "@/components/modals/ModalFame";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { CUSTOMER_CREATE_ROLES } from "@/features/auth/roles";
import { useCustomers } from "../hooks/use-customers";
import { CustomerCreateForm } from "./CustomerCreateForm";
import { CustomersTable } from "./CustomersTable";

export function CustomersPage() {
  const [showForm, setShowForm] = useState(false);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canCreate = hasAccess(CUSTOMER_CREATE_ROLES);
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
          canCreate ? (
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="size-4" />
              Add customer
            </Button>
          ) : undefined
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
