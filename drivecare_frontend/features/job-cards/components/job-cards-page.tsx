"use client";

import { PageHeader } from "@/components/page-header";
import { useBranchStore } from "@/store/branch.store";
import { useJobCards } from "../hooks/use-job-cards";
import { JobCardsTable } from "./JobCardsTable";

export function JobCardsPage() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { data } = useJobCards({ page: 1, limit: 1, branchId: activeBranch?.id });

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Job Cards"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "job card" : "job cards"} on record`
            : undefined
        }
      />
      <JobCardsTable />
    </div>
  );
}
