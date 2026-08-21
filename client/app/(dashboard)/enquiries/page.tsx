"use client";

import { PageHeader } from "@/components/headers/page-header";
import { EnquiriesTable } from "@/features/enquiry/components/EnquiriesTable";
import { useMemo } from "react";

export default function EnquiriesPage() {
//   const branchId = useBranchStore((s) => s.activeBranch?.id);
  const actions = useMemo(() => null, []);

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <PageHeader title="Triage Queue" description="Open enquiries awaiting review." actions={actions} />
      <EnquiriesTable />
    </div>
  );
}
