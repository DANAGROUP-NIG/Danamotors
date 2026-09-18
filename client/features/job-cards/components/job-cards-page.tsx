"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";
import { useBranchStore } from "@/store/branch.store";
import { useJobCards } from "../hooks/use-job-cards";
import type { JobCard } from "../types/job-card.types";
import { JobCardsTable } from "./JobCardsTable";

function exportRows(jobCards: JobCard[]) {
  return jobCards.map((jobCard) => ({
    jobNumber: jobCard.jobNumber,
    vehicleRegistration: jobCard.vehicle?.registrationNumber ?? "",
    customer: jobCard.customer
      ? `${jobCard.customer.firstName} ${jobCard.customer.lastName}`
      : "",
    branch: jobCard.branch?.name ?? "",
    agent: jobCard.createdBy
      ? `${jobCard.createdBy.firstName} ${jobCard.createdBy.lastName}`
      : "",
    progress: jobCard.progress,
    status: jobCard.status,
    createdAt: jobCard.createdAt,
  }));
}

function exportColumns() {
  return [
    { key: "jobNumber", label: "Job #" },
    { key: "vehicleRegistration", label: "Vehicle Reg No" },
    { key: "customer", label: "Customer" },
    { key: "branch", label: "Branch" },
    { key: "agent", label: "Agent" },
    { key: "progress", label: "Progress (%)" },
    { key: "status", label: "Status" },
    { key: "createdAt", label: "Created At" },
  ];
}

function ExportJobCardsButton({ branchId }: { branchId?: string }) {
  const { data } = useJobCards({ page: 1, limit: 1000, branchId });
  const jobCards = data?.jobCards ?? [];
  const filename = `dana-motors-job-cards-${new Date().toISOString().split("T")[0]}`;

  return (
    <ActionMenu
      align="end"
      trigger={
        <Button
          variant="outline"
          size="sm"
          disabled={jobCards.length === 0}
          className="h-9 gap-1.5"
        >
          <Download className="size-4" />
          Export
        </Button>
      }
    >
      <ActionMenuItem
        icon={<Download className="size-4" />}
        onClick={() => downloadCsv(filename, exportRows(jobCards), exportColumns())}
      >
        Export as CSV
      </ActionMenuItem>
      <ActionMenuItem
        icon={<FileSpreadsheet className="size-4" />}
        onClick={() => downloadExcel(filename, exportRows(jobCards), exportColumns())}
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

export function JobCardsPage() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { data } = useJobCards({
    page: 1,
    limit: 1,
    branchId: activeBranch?.id,
  });

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Job Cards"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "job card" : "job cards"} on record`
            : undefined
        }
        actions={<ExportJobCardsButton branchId={activeBranch?.id} />}
      />
      <JobCardsTable />
    </div>
  );
}
