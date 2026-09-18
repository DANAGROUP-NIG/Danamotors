"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { useBranchStore } from "@/store/branch.store";
import { useEnquiries } from "@/features/enquiry/hooks/use-enquires";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";
import type { Enquiry } from "@/features/enquiry/types/enquiry.types";
import { EnquiriesTable } from "@/features/enquiry/components/EnquiriesTable";

type ExportableEnquiryRow = Record<string, string | number | boolean | null | undefined>;

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function vehicleLabel(e: Enquiry): string {
  const parts = [e.vehicleMake, e.vehicleModel, e.vehicleRegNumber].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "";
}

function exportColumns() {
  return [
    { key: "id", label: "ID" },
    { key: "customer", label: "Customer" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "vehicle", label: "Vehicle" },
    { key: "preferredDate", label: "Preferred Date" },
    { key: "status", label: "Status" },
    { key: "branch", label: "Branch" },
    { key: "serviceDescription", label: "Service Description" },
    { key: "submittedAt", label: "Submitted" },
  ];
}

function toExportableRow(e: Enquiry): ExportableEnquiryRow {
  return {
    id: e.id,
    customer: `${e.firstName} ${e.lastName}`.trim(),
    email: e.email,
    phone: e.phoneNumber,
    vehicle: vehicleLabel(e),
    preferredDate: formatDate(e.preferredDate),
    status: e.status,
    branch: e.branch.name,
    serviceDescription: e.serviceDescription,
    submittedAt: formatDate(e.createdAt),
  };
}

export default function EnquiriesPage() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const branchId = activeBranch?.id;

  const { data: exportData, isFetching: isExportFetching } = useEnquiries({
    branchId,
    page: 1,
    limit: 10000,
  });

  const allEnquiries = exportData?.enquiries ?? [];
  const hasData = allEnquiries.length > 0;

  function handleExportCsv() {
    if (!hasData) return;
    const rows = allEnquiries.map(toExportableRow);
    const branchSlug = (activeBranch?.name ?? "all").replace(/\s+/g, "-").toLowerCase();
    const filename = `enquiries-${branchSlug}-${new Date().toISOString().split("T")[0]}`;
    downloadCsv(filename, rows, exportColumns());
  }

  function handleExportExcel() {
    if (!hasData) return;
    const rows = allEnquiries.map(toExportableRow);
    const branchSlug = (activeBranch?.name ?? "all").replace(/\s+/g, "-").toLowerCase();
    const filename = `enquiries-${branchSlug}-${new Date().toISOString().split("T")[0]}`;
    downloadExcel(filename, rows, exportColumns());
  }

  const exportDisabled = !branchId || isExportFetching || !hasData;

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <PageHeader
        title="Enquiry Queue"
        description="Open enquiries awaiting review."
        actions={
          <ActionMenu
            trigger={
              <Button
                variant="outline"
                size="sm"
                disabled={exportDisabled}
                className="h-9 gap-1.5"
              >
                <Download className="size-4" />
                Export
              </Button>
            }
          >
            <ActionMenuItem
              icon={<Download className="size-4" />}
              onClick={handleExportCsv}
            >
              Export CSV
            </ActionMenuItem>
            <ActionMenuItem
              icon={<FileSpreadsheet className="size-4" />}
              onClick={handleExportExcel}
            >
              Export Excel
            </ActionMenuItem>
          </ActionMenu>
        }
      />
      <EnquiriesTable />
    </div>
  );
}
