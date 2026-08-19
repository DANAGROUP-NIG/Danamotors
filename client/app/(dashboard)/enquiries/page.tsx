"use client";

import { PageHeader } from "@/components/headers/page-header";
import { EnquiriesTable } from "@/features/enquiry/components/EnquiriesTable";
import { useBranchStore } from "@/store/branch.store";
import { useMemo } from "react";

export default function EnquiriesPage() {
  const branchId = useBranchStore((s) => s.selectedBranchId);
  const actions = useMemo(() => null, []);

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <PageHeader title="Triage Queue" description="Open enquiries awaiting review." actions={actions} />
      <EnquiriesTable branchId={branchId} />
    </div>
  );
}
