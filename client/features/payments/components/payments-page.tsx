"use client";

import { useState } from "react";
import { Plus, Download, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { RecordPaymentModal } from "@/features/invoices/components/RecordPaymentModal";
import { usePayments } from "../hooks/use-payments";
import {
  PaymentsTable,
  paymentExportColumns,
  toPaymentExportRow,
} from "./PaymentsTable";

export function PaymentsPage() {
  const [showPayment, setShowPayment] = useState(false);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("payment:create");
  const { data } = usePayments({ branchId: activeBranch?.id });

  const payments = data?.payments ?? [];
  const total = data?.payments?.length;

  const today = new Date().toISOString().split("T")[0];
  const filename = `payments-${today}`;

  function exportAll() {
    downloadCsv(filename, payments.map(toPaymentExportRow), paymentExportColumns());
  }

  function exportAllExcel() {
    downloadExcel(filename, payments.map(toPaymentExportRow), paymentExportColumns());
  }

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
          <div className="flex items-center gap-2">
            <ActionMenu
              trigger={
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <Download className="size-3.5" />
                  Export
                </Button>
              }
            >
              <ActionMenuItem icon={<Download className="size-4" />} onClick={exportAll}>
                Export CSV
              </ActionMenuItem>
              <ActionMenuItem icon={<FileSpreadsheet className="size-4" />} onClick={exportAllExcel}>
                Export Excel
              </ActionMenuItem>
            </ActionMenu>
            {canCreate && (
              <Button size="sm" onClick={() => setShowPayment(true)}>
                <Plus className="size-4" />
                Record payment
              </Button>
            )}
          </div>
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
