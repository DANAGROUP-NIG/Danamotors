"use client";

import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/headers/page-header";
import { JobCardCreateForm } from "@/features/job-cards";

export default function NewJobCardPage() {
  const params = useSearchParams();
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader title="New Job Card" description="Open a job for a customer vehicle." />
      <JobCardCreateForm appointmentId={params.get("appointmentId") ?? undefined} vehicleId={params.get("vehicleId") ?? undefined} />
    </div>
  );
}
