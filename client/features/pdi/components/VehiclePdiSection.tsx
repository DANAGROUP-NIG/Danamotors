"use client";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useVehiclePdiJobs } from "../hooks/use-pdi";
import { formatDate, formatMoney, PDI_PERMISSIONS, personName } from "../lib/pdi.logic";
import { DetailField, EmptyNote, PdiStatusPill, SectionCard, tdCls, thCls } from "./pdi-ui";

type VehiclePdiInfo = { id: string; pdiDone?: boolean | null; pdiDate?: string | null; tyres?: unknown; batteryMake?: string | null; batteryNumber?: string | null };

/** Vehicle page: PDI done/date, tyres and, for pdi:read, the vehicle's PDI jobs (never in the service history). */
export function VehiclePdiSection({ vehicle }: { vehicle: VehiclePdiInfo }) {
  const { hasPermission } = useAuth();
  const canRead = hasPermission(PDI_PERMISSIONS.READ);
  const jobs = useVehiclePdiJobs(vehicle.id, canRead);
  const tyres = (Array.isArray(vehicle.tyres) ? vehicle.tyres as { make?: string; number?: string }[] : []).filter(tyre => tyre.make || tyre.number);

  return (
    <SectionCard icon={<ClipboardCheck />} title="Pre-delivery inspection (PDI)" note="PDI jobs are kept out of the service history">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DetailField label="PDI done" value={vehicle.pdiDone ? "Yes" : "No"} />
        <DetailField label="PDI date" value={formatDate(vehicle.pdiDate)} />
        <DetailField label="Tyres" value={tyres.length ? tyres.map(tyre => [tyre.make, tyre.number].filter(Boolean).join(" ")).join("; ") : null} />
        <DetailField label="Battery" value={[vehicle.batteryMake, vehicle.batteryNumber].filter(Boolean).join(" · ") || null} />
      </dl>
      {canRead && (
        <div className="mt-5 border-t border-border pt-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">PDI job cards</p>
          {jobs.isLoading ? <p role="status" className="text-sm text-muted-foreground">Loading…</p>
            : jobs.isError ? <p role="alert" className="text-sm text-destructive">Could not load the PDI jobs.</p>
            : jobs.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr>{["PDI job", "Date", "PDI reg.", "Engineer", "Defect estimate", "Bill", "Status"].map(label => <th key={label} className={thCls}>{label}</th>)}</tr></thead>
                  <tbody>
                    {jobs.data.map(job => (
                      <tr key={job.id} className="border-t border-border">
                        <td className={tdCls}><Link href={`/pdi/${job.id}`} className="font-mono text-primary hover:underline">{job.jobNumber}</Link></td>
                        <td className={tdCls}>{formatDate(job.createdAt)}</td>
                        <td className={`${tdCls} font-mono`}>{job.pdiRegistration ?? "—"}</td>
                        <td className={tdCls}>{personName(job.engineer)}</td>
                        <td className={tdCls}>{formatMoney(job.defectTotals.total)}</td>
                        <td className={tdCls}>{job.invoices.map(invoice => `${invoice.invoiceNumber} (${formatMoney(invoice.total)})`).join(", ") || "—"}</td>
                        <td className={tdCls}><PdiStatusPill status={job.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyNote>No PDI job cards for this vehicle.</EmptyNote>}
        </div>
      )}
    </SectionCard>
  );
}
