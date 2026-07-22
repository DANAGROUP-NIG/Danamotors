"use client";

import { PageHeader } from "@/components/page-header";
import { useBranchStore } from "@/store/branch.store";
import { usePayments } from "../hooks/use-payments";
import { PaymentsTable } from "./PaymentsTable";

export function PaymentsPage() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { data } = usePayments({ branchId: activeBranch?.id });

  const total = data?.payments?.length;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Payments"
        description={
          total != null
            ? `${total} ${total === 1 ? "payment" : "payments"} on record`
            : undefined
        }
      />
      <PaymentsTable />
    </div>
  );
}
