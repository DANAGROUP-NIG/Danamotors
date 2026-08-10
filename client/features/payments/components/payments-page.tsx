"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { FINANCE_ROLES } from "@/features/auth/roles";
import { RecordPaymentModal } from "@/features/invoices/components/RecordPaymentModal";
import { usePayments } from "../hooks/use-payments";
import { PaymentsTable } from "./PaymentsTable";

export function PaymentsPage() {
  const [showPayment, setShowPayment] = useState(false);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canCreate = hasAccess(FINANCE_ROLES);
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
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setShowPayment(true)}>
              <Plus className="size-4" />
              Record payment
            </Button>
          ) : undefined
        }
      />
      <PaymentsTable />

      <RecordPaymentModal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
      />
    </div>
  );
}
