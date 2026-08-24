"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { FINANCE_ROLES } from "@/features/auth/roles";
import { useInvoices } from "../hooks/use-invoices";
import { InvoicesTable } from "./InvoicesTable";

export function InvoicesPage() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canCreate = hasAccess(FINANCE_ROLES);
  const { data } = useInvoices({ branchId: activeBranch?.id });

  const total = data?.invoices?.length ?? 0;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Invoices"
        description={
          total > 0
            ? `${total} ${total === 1 ? "invoice" : "invoices"} on record`
            : "Customer invoices for completed services."
        }
        actions={
          canCreate ? (
            <Link href="/invoices/new">
              <Button size="sm">
                <Plus className="size-4" />
                New invoice
              </Button>
            </Link>
          ) : undefined
        }
      />
      <InvoicesTable />
    </div>
  );
}
