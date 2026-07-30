"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useRef } from "react";
import { useJobCard } from "@/features/job-cards";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { SERVICE_UPDATE_ROLES } from "@/features/auth/roles";
import {
  ArrowLeft,
  Loader2,
  Printer,
  FileText,
  Package,
  User,
  Car,
  Building2,
  Clock,
  Wrench,
  ClipboardCheck,
  Receipt,
  Gauge,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/table-components/StatusBadge";
import type { JobCardStatus, PartIssuance, JobCardInvoice } from "@/features/job-cards/types/job-card.types";

const STATUS_TONES: Record<JobCardStatus, StatusTone> = {
  pending: "amber",
  in_progress: "blue",
  completed: "emerald",
  on_hold: "gray",
  cancelled: "red",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function fmtCurrency(n: number) {
  return `₦${n.toLocaleString()}`;
}

export default function JobCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: jobCard, isLoading, error } = useJobCard(id);
  const { hasAccess } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  const canManage = hasAccess(SERVICE_UPDATE_ROLES);

  function handlePrint() {
    window.print();
  }

  function handleGenerateInvoice() {
    router.push(`/invoices/new?jobCardId=${id}&customerId=${jobCard?.customerId}`);
  }

  function handleRequestParts() {
    router.push(`/inventory/issuances/new?jobCardId=${id}`);
  }

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

  const tone = STATUS_TONES[jobCard.status as JobCardStatus] ?? "gray";
  const vehicleLabel = `${jobCard.vehicle.year} ${jobCard.vehicle.make} ${jobCard.vehicle.model}`;
  const customerName = `${jobCard.customer.firstName} ${jobCard.customer.lastName}`;
  const totalPartsCost = (jobCard.partIssuances ?? []).reduce(
    (sum, p) => sum + p.sparePart.unitPrice * p.quantity, 0
  );
  const totalInvoiced = (jobCard.invoices ?? []).reduce(
    (sum, inv) => sum + inv.total, 0
  );

  return (
    <div className="px-4 py-6 lg:px-6 print:px-0 print:py-0">
      {/* Screen-only top bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/job-cards" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Job Cards
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5">
            <Printer className="size-4" /> Print
          </Button>
          {canManage && (
            <>
              <Button size="sm" variant="outline" onClick={handleGenerateInvoice} className="gap-1.5">
                <Receipt className="size-4" /> Generate Invoice
              </Button>
              <Button size="sm" variant="outline" onClick={handleRequestParts} className="gap-1.5">
                <Package className="size-4" /> Request Parts
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Print-friendly content wrapper */}
      <div ref={printRef} className="space-y-5">
        {/* ── Header Card ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 print:border print:shadow-none">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-800">{jobCard.jobNumber}</h1>
              <p className="mt-1 text-sm text-slate-500">{jobCard.description}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 print:text-xs">
                Created {fmtDate(jobCard.createdAt)}
              </span>
              <StatusBadge status={jobCard.status.replace("_", " ")} tone={tone} />
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>0%</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${jobCard.progress ?? 0}%` }}
                />
              </div>
              <span>100%</span>
            </div>
            <p className="mt-1 text-right text-xs font-medium text-primary">{jobCard.progress ?? 0}% complete</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField icon={<Building2 className="size-4" />} label="Branch" value={jobCard.branch.name} />
            <DetailField icon={<User className="size-4" />} label="Created By" value={jobCard.createdBy?.firstName} />
            <DetailField icon={<Wrench className="size-4" />} label="Assigned To" value={jobCard.assignedTo} />
            <DetailField icon={<Clock className="size-4" />} label="Updated" value={fmtDate(jobCard.updatedAt)} />
          </div>
        </div>

        {/* ── Customer & Vehicle ── */}
        <div className="grid gap-5 md:grid-cols-2">
          <SectionCard icon={<User className="size-4" />} title="Customer">
            <div className="space-y-2 text-sm">
              <p className="font-medium text-slate-800">{customerName}</p>
              <p className="text-slate-500">{jobCard.customer.email}</p>
              <Link href={`/customers/${jobCard.customer.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                View full profile
              </Link>
            </div>
          </SectionCard>

          <SectionCard icon={<Car className="size-4" />} title="Vehicle">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Make / Model</p>
                <p className="text-slate-800">{vehicleLabel}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">VIN</p>
                <p className="text-slate-800">{jobCard.vehicle.vin}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Color</p>
                <p className="text-slate-800">{jobCard.vehicle.color}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Year</p>
                <p className="text-slate-800">{jobCard.vehicle.year}</p>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Job Specs ── */}
        <SectionCard icon={<Gauge className="size-4" />} title="Job Specs">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Estimated Hours</p>
              <p className="mt-0.5 text-sm text-slate-800">{jobCard.estimatedHours ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Estimated Cost</p>
              <p className="mt-0.5 text-sm text-slate-800">{jobCard.estimatedCost ? fmtCurrency(jobCard.estimatedCost) : "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">QC Status</p>
              <p className="mt-0.5 text-sm text-slate-800 capitalize">{jobCard.qcStatus?.replace("_", " ") ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Appointment</p>
              <p className="mt-0.5 text-sm text-slate-800">
                {jobCard.appointment ? fmtDate(jobCard.appointment.scheduledAt) : "—"}
              </p>
            </div>
          </div>
          {jobCard.qcNotes && (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">QC Notes</p>
              <p className="mt-0.5 text-sm text-slate-600">{jobCard.qcNotes}</p>
            </div>
          )}
        </SectionCard>

        {/* ── Technician & QC Assignments ── */}
        <div className="grid gap-5 md:grid-cols-2">
          <SectionCard icon={<Wrench className="size-4" />} title="Technician">
            {jobCard.technician ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-slate-800">
                  {jobCard.technician.firstName} {jobCard.technician.lastName}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Not assigned</p>
            )}
          </SectionCard>

          <SectionCard icon={<ClipboardCheck className="size-4" />} title="Quality Inspector">
            {jobCard.qualityInspector ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-slate-800">
                  {jobCard.qualityInspector.firstName} {jobCard.qualityInspector.lastName}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Not assigned</p>
            )}
          </SectionCard>
        </div>

        {/* ── Inspections ── */}
        {jobCard.inspections && jobCard.inspections.length > 0 && (
          <SectionCard icon={<SearchCheckIcon />} title={`Inspections (${jobCard.inspections.length})`}>
            <div className="space-y-3">
              {jobCard.inspections.map((insp) => (
                <div key={insp.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-center gap-2">
                    {insp.passed === true ? (
                      <CheckCircle className="size-5 text-emerald-600" />
                    ) : insp.passed === false ? (
                      <XCircle className="size-5 text-red-600" />
                    ) : (
                      <Loader2 className="size-5 animate-spin text-slate-400" />
                    )}
                    <span className="text-sm font-medium text-slate-700 capitalize">{insp.status.replace("_", " ")}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600">{insp.findings}</p>
                  {insp.notes && <p className="mt-1 text-xs text-slate-400">{insp.notes}</p>}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── Estimates ── */}
        {jobCard.estimates && jobCard.estimates.length > 0 && (
          <SectionCard icon={<Receipt className="size-4" />} title={`Estimates (${jobCard.estimates.length})`}>
            <div className="space-y-2">
              {jobCard.estimates.map((est) => {
                const approval = est.approvals?.[0];
                return (
                  <div key={est.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700">{est.description}</p>
                      {approval && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          Customer approval:{" "}
                          {approval.approved === true ? (
                            <span className="font-medium text-emerald-600">Approved</span>
                          ) : approval.approved === false ? (
                            <span className="font-medium text-red-600">Rejected</span>
                          ) : (
                            <span className="text-slate-400">Pending</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs font-medium text-slate-500 capitalize">{est.status}</span>
                      <span className="text-sm font-semibold text-slate-800">
                        {est.currency} {est.amount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* ── Parts Issued ── */}
        {jobCard.partIssuances && jobCard.partIssuances.length > 0 && (
          <SectionCard icon={<Package className="size-4" />} title={`Parts Issued (${jobCard.partIssuances.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Part #</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Name</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Unit Price</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Total</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Issued By</th>
                  </tr>
                </thead>
                <tbody>
                  {jobCard.partIssuances.map((pi) => (
                    <PartIssuanceRow key={pi.id} issuance={pi} />
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                      Total Parts Cost
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-slate-800">
                      {fmtCurrency(totalPartsCost)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>
        )}

        {/* ── Invoices ── */}
        {jobCard.invoices && jobCard.invoices.length > 0 && (
          <SectionCard icon={<FileText className="size-4" />} title={`Invoices (${jobCard.invoices.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Invoice #</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Date</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Total</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {jobCard.invoices.map((inv) => (
                    <InvoiceRow key={inv.id} invoice={inv} />
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200">
                  <tr>
                    <td colSpan={2} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                      Total Invoiced
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-slate-800">
                      {fmtCurrency(totalInvoiced)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>
        )}

        {/* ── Empty state if nothing at all ── */}
        {!jobCard.inspections?.length &&
          !jobCard.estimates?.length &&
          !jobCard.partIssuances?.length &&
          !jobCard.invoices?.length && (
            <SectionCard icon={<FileText className="size-4" />} title="Activity">
              <p className="text-sm text-slate-400">No inspections, estimates, parts, or invoices recorded yet.</p>
            </SectionCard>
          )}
      </div>

      {/* ── Print Styles ── */}
      <style jsx global>{`
        @media print {
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          * {
            overflow: visible !important;
            max-height: none !important;
          }
          header, aside, nav[aria-label="Mobile navigation"] {
            display: none !important;
          }
          main {
            overflow: visible !important;
            height: auto !important;
          }
          @page {
            margin: 16mm 12mm;
            size: auto;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:border {
            border: 1px solid #e2e8f0 !important;
          }
          .print\\:px-0 {
            padding-left: 0 !important;
            padding-right: 0 !important;
          }
          .print\\:py-0 {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .space-y-5 > * + * {
            margin-top: 1rem !important;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SearchCheckIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM10.5 7.5v6m3-3h-6" />
    </svg>
  );
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 print:border print:shadow-none">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function DetailField({ icon, label, value }: { icon?: React.ReactNode; label: string; value?: string | number | null }) {
  return (
    <div>
      {icon && <span className="inline-flex items-center gap-1.5">{icon}</span>}
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-700">{value ?? "—"}</p>
    </div>
  );
}

function PartIssuanceRow({ issuance }: { issuance: PartIssuance }) {
  const lineTotal = issuance.sparePart.unitPrice * issuance.quantity;
  const returnedQty = issuance.returns?.reduce((s, r) => s + r.quantity, 0) ?? 0;
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 font-medium text-slate-700">{issuance.sparePart.partNumber}</td>
      <td className="px-3 py-2 text-slate-600">{issuance.sparePart.name}</td>
      <td className="px-3 py-2 text-right text-slate-700">
        {issuance.quantity}
        {returnedQty > 0 && <span className="ml-1 text-xs text-slate-400">(-{returnedQty})</span>}
      </td>
      <td className="px-3 py-2 text-right text-slate-600">{issuance.sparePart.unitPrice.toLocaleString()}</td>
      <td className="px-3 py-2 text-right font-medium text-slate-800">{lineTotal.toLocaleString()}</td>
      <td className="px-3 py-2 text-slate-600">{issuance.issuedBy.firstName}</td>
    </tr>
  );
}

function InvoiceRow({ invoice }: { invoice: JobCardInvoice }) {
  const totalPaid = (invoice.payments as { amount: number }[])?.reduce((s, p) => s + p.amount, 0) ?? 0;
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 font-medium text-slate-700">{invoice.invoiceNumber}</td>
      <td className="px-3 py-2 text-slate-600">{new Date(invoice.issuedDate).toLocaleDateString()}</td>
      <td className="px-3 py-2 text-right font-medium text-slate-800">{invoice.total.toLocaleString()}</td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
          invoice.status === "Paid"
            ? "bg-emerald-50 text-emerald-700"
            : invoice.status === "Unpaid"
            ? "bg-amber-50 text-amber-700"
            : "bg-blue-50 text-blue-700"
        }`}>
          {invoice.status}
        </span>
      </td>
      <td className="px-3 py-2 text-slate-600">{totalPaid > 0 ? fmtCurrency(totalPaid) : "—"}</td>
    </tr>
  );
}
