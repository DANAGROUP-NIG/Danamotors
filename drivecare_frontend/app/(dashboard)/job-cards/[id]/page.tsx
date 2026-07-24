"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useJobCard } from "@/features/job-cards";
import { ArrowLeft, Loader2 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  on_hold: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
};

export default function JobCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: jobCard, isLoading, error } = useJobCard(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !jobCard) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/job-cards" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Job Cards
        </Link>
        <p className="text-sm text-red-500">Job card not found.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 lg:px-6">
      <Link href="/job-cards" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Job Cards
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">{jobCard.jobNumber}</h1>
            <p className="mt-1 text-sm text-slate-500">{jobCard.description}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_COLORS[jobCard.status] ?? "bg-slate-100 text-slate-600"}`}>
            {jobCard.status.replace("_", " ")}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Branch" value={jobCard.branch?.name} />
          <DetailField
            label="Customer"
            value={
              jobCard.customer
                ? `${jobCard.customer.firstName} ${jobCard.customer.lastName}`
                : null
            }
          />
          <DetailField
            label="Vehicle"
            value={
              jobCard.vehicle
                ? `${jobCard.vehicle.year} ${jobCard.vehicle.make} ${jobCard.vehicle.model}`
                : null
            }
          />
          {jobCard.vehicle?.vin && <DetailField label="VIN" value={jobCard.vehicle.vin} />}
          <DetailField label="Estimated Hours" value={jobCard.estimatedHours} />
          <DetailField
            label="Estimated Cost"
            value={jobCard.estimatedCost ? `₦${jobCard.estimatedCost.toLocaleString()}` : null}
          />
          <DetailField label="Progress" value={`${jobCard.progress ?? 0}%`} />
          <DetailField label="QC Status" value={jobCard.qcStatus} />
          {jobCard.qcNotes && <DetailField label="QC Notes" value={jobCard.qcNotes} />}
          {jobCard.appointment && (
            <DetailField
              label="Appointment"
              value={new Date(jobCard.appointment.scheduledAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            />
          )}
        </div>
      </div>

      {/* Inspections */}
      {jobCard.inspections && jobCard.inspections.length > 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Inspections</h2>
          <div className="space-y-3">
            {jobCard.inspections.map((insp) => (
              <div key={insp.id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex size-5 items-center justify-center rounded-full text-xs font-bold ${
                      insp.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                    }`}
                  >
                    {insp.passed ? "✓" : "✗"}
                  </span>
                  <span className="text-sm font-medium text-slate-700">{insp.status}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">{insp.findings}</p>
                {insp.notes && (
                  <p className="mt-1 text-xs text-slate-400">{insp.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estimates */}
      {jobCard.estimates && jobCard.estimates.length > 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Estimates</h2>
          <div className="space-y-2">
            {jobCard.estimates.map((est) => (
              <div key={est.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <span className="text-sm text-slate-700">{est.description}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-500">{est.status}</span>
                  <span className="text-sm font-semibold text-slate-800">
                    {est.currency} {est.amount.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-700">{value ?? "—"}</p>
    </div>
  );
}
