"use client";
import { useParams } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { JobCardPrint } from "@/features/job-cards/components/print/JobCardPrint";
import { PrintPageFrame } from "@/features/job-cards/components/print/PrintPageFrame";
import { useJobCardPrint } from "@/features/job-cards/hooks/use-job-print";

/** The printed job card: A4, the paper form on the front and the numbered terms on the back (phase 11). */
export default function JobCardPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  // It carries the customer's signatures and amounts: the same permission as the signed copies.
  const allowed = hasPermission("jobcard:read") && hasPermission("estimate:print");
  const query = useJobCardPrint(id, allowed);
  return (
    <PrintPageFrame
      jobId={id}
      name="job card"
      printLabel="Print job card"
      allowed={allowed}
      deniedMessage="Printing the job card needs the estimate print permission. Service advisors, service managers and workshop supervisors can print it."
      query={query}
      pageCss={`@page { size: A4 portrait; margin: 9mm 10mm 12mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; } }
@media print { html { font-size: 85%; } }`}
    >
      {query.data && <JobCardPrint data={query.data} />}
    </PrintPageFrame>
  );
}
