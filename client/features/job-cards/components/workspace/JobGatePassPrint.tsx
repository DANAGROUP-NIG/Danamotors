import { NOT_PROVIDED, formatDateTime } from "@/lib/format";
import { customerName, vehicleTitle } from "../../lib/job-frame.logic";
import type { JobCard } from "../../types/job-card.types";

/**
 * The gate pass, printed from the browser. Hidden on screen; the rest of the job page is hidden
 * when printing, so only this prints. TODO(phase 11): replaced by the A6 gate pass print.
 */
export function JobGatePassPrint({ job }: { job: JobCard }) {
  if (!job.gatePassNumber) return null;
  const rows: [string, string][] = [
    ["Job card", job.jobNumber],
    ["Branch", job.branch?.name ?? NOT_PROVIDED],
    ["Customer", customerName(job.customer)],
    ["Vehicle", vehicleTitle(job.vehicle)],
    ["Plate or VIN", job.vehicle?.registrationNumber || job.vehicle?.vin || NOT_PROVIDED],
    ["Delivered", formatDateTime(job.deliveredAt)],
    ["Delivery advisor", job.deliveryAdvisor ? `${job.deliveryAdvisor.firstName} ${job.deliveryAdvisor.lastName}` : NOT_PROVIDED],
  ];
  return (
    <section aria-label="Gate pass" className="hidden break-inside-avoid space-y-4 border-2 border-foreground p-6 text-foreground print:block">
      <h1 className="text-xl font-semibold">Gate pass {job.gatePassNumber}</h1>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-2 gap-8 pt-10 text-sm">
        <p className="border-t border-foreground pt-1">Security signature</p>
        <p className="border-t border-foreground pt-1">Date and time</p>
      </div>
    </section>
  );
}
