"use client";

import { PageHeader } from "@/components/headers/page-header";
import { useBranchStore } from "@/store/branch.store";
import { useInvoices } from "../hooks/use-invoices";
import { InvoicesTable } from "./InvoicesTable";

export function InvoicesPage() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
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
      />
      <InvoicesTable />
    </div>
  );
}
