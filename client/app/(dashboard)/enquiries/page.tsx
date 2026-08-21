"use client";

import { PageHeader } from "@/components/headers/page-header";
import { EnquiriesTable } from "@/features/enquiry/components/EnquiriesTable";

export default function EnquiriesPage() {
  return (
    <div className="space-y-6 p-4 lg:p-6">
      <PageHeader
        title="Enquiry Queue"
        description="Open enquiries awaiting review."
      />
      <EnquiriesTable />
    </div>
  );
}
