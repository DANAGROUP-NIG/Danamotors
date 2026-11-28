"use client";
import { useParams } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { GatePassSlip } from "@/features/job-cards/components/print/GatePassSlip";
import { PrintPageFrame } from "@/features/job-cards/components/print/PrintPageFrame";
import { useGatePassPrint } from "@/features/job-cards/hooks/use-job-print";

/** The A6 gate pass slip for the security post (phase 11). */
export default function GatePassPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const allowed = hasPermission("jobcard:read");
  const query = useGatePassPrint(id, allowed);
  return (
    <PrintPageFrame
      jobId={id}
      name="gate pass"
      printLabel="Print gate pass"
      allowed={allowed}
      deniedMessage="Printing the gate pass needs access to job cards. Ask your administrator for job card access."
      query={query}
      // Chrome does not accept the A6 keyword, so the size is given in millimetres.
      pageCss={`@page { size: 105mm 148mm; margin: 6mm; }\n@media print { html { font-size: 85%; } }`}
    >
      {query.data && <GatePassSlip data={query.data} />}
    </PrintPageFrame>
  );
}
