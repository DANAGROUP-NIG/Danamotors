"use client";
import {
  JOB_CARD_STATUS_TONES,
  canonicalJobStatus,
  hasJobBill,
} from "@/features/job-cards/types/job-card-status";
import { JobCardPartsSection } from "@/features/job-cards/components/JobCardPartsSection";
import { JobCardEstimateSection } from "@/features/job-cards/components/JobCardEstimateSection";
import { JobCardEditForm } from "@/features/job-cards/components/JobCardEditForm";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useRef } from "react";
import { useJobCard } from "@/features/job-cards";
import { useAuth } from "@/features/auth/hooks/use-auth";
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
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import type {
  JobCardStatus,
  PartIssuance,
  JobCardInvoice,
} from "@/features/job-cards/types/job-card.types";
import { JobCardLabourSection } from "@/features/job-cards/components/JobCardLabourSection";

const STATUS_TONES = JOB_CARD_STATUS_TONES;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function fmtCurrency(n: number) {
  return `₦${n.toLocaleString()}`;
}

export default function JobCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: jobCard, isLoading, error } = useJobCard(id);
  const { hasPermission } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  const canManage = hasPermission("jobcard:update");
  const canCreateBill = hasPermission("invoice:job-bill:create");

  function handlePrint() {
    window.print();
  }

  function handlePrintGatePass() {
    document.body.dataset.jobCardPrint = "gate-pass";
    try {
      window.print();
    } finally {
      delete document.body.dataset.jobCardPrint;
    }
  }

  function handleGenerateInvoice() {
    router.push(
      `/invoices/new?jobCardId=${id}&customerId=${jobCard?.customerId}`,
    );
  }

  function handleRequestParts() {
    document
      .getElementById("job-parts")
      ?.scrollIntoView({ behavior: "smooth" });
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
        <Link
          href="/job-cards"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" /> Back to Job Cards
        </Link>
        <p className="text-sm text-red-500">Job card not found.</p>
      </div>
    );
  }

  const tone = STATUS_TONES[jobCard.status as JobCardStatus] ?? "gray";
  const vehicleLabel = jobCard.vehicle
    ? `${jobCard.vehicle.year ?? ""} ${jobCard.vehicle.make ?? ""} ${jobCard.vehicle.model ?? ""}`.trim() ||
      "—"
    : "—";
  const customerName = jobCard.customer
    ? jobCard.customer.companyName ||
      `${jobCard.customer.firstName} ${jobCard.customer.lastName}`.trim()
    : "—";
  const partIssuances = jobCard.partIssuances ?? [];
  const missingRetailRate = partIssuances.some((issuance) => {
    const returned = issuance.returns.reduce(
      (sum, partReturn) =>
        sum +
        (partReturn.status.toUpperCase() === "REJECTED"
          ? 0
          : partReturn.quantity),
      0,
    );
    return (
      issuance.quantity > returned && issuance.sparePart?.retailRate == null
    );
  });
  const totalPartsCost = missingRetailRate
    ? null
    : partIssuances.reduce((sum, issuance) => {
        const returned = issuance.returns.reduce(
          (total, partReturn) =>
            total +
            (partReturn.status.toUpperCase() === "REJECTED"
              ? 0
              : partReturn.quantity),
          0,
        );
        const remaining = Math.max(issuance.quantity - returned, 0);
        return sum + (issuance.sparePart?.retailRate ?? 0) * remaining;
      }, 0);
  const totalInvoiced = (jobCard.invoices ?? []).reduce(
    (sum, inv) =>
      sum +
      (["CANCELLED", "CANCELED", "VOID"].includes(inv.status.toUpperCase())
        ? 0
        : inv.total),
    0,
  );

  return (
    <div className="px-4 py-4 lg:px-5 print:px-0 print:py-0">
      {/* Screen-only top bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href="/job-cards"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" /> Back to Job Cards
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrint}
            className="gap-1.5"
          >
            <Printer className="size-4" /> Print
          </Button>
          {jobCard.gatePassNumber && (
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrintGatePass}
              className="gap-1.5"
            >
              <Printer className="size-4" /> Print gate pass
            </Button>
          )}
          {(canManage || canCreateBill) && (
            <>
              {canCreateBill &&
                !jobCard.billedAt &&
                !(jobCard.invoices ?? []).some(
                  (invoice) =>
                    !["CANCELLED", "CANCELED", "VOID"].includes(
                      invoice.status.toUpperCase(),
                    ),
                ) &&
                (["READY", "Ready", "Completed"].includes(jobCard.status) ||
                  (canonicalJobStatus(jobCard.status) === "DELIVERED" &&
                    !!jobCard.creditApprovedById)) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateInvoice}
                    className="gap-1.5"
                  >
                    <Receipt className="size-4" /> Create Job Bill
                  </Button>
                )}
              {(hasPermission("partissuance:create") ||
                hasPermission("partreturn:create")) &&
                !hasJobBill(jobCard) &&
                !["DELIVERED", "CANCELLED"].includes(
                  canonicalJobStatus(jobCard.status),
                ) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRequestParts}
                    className="gap-1.5"
                  >
                    <Package className="size-4" /> Request Parts
                  </Button>
                )}
            </>
          )}
        </div>
      </div>

      {/* Print-friendly content wrapper */}
      <div ref={printRef} className="job-card-print-content space-y-4">
        {/* ── Header Card ── */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 print:border print:shadow-none">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-800">
                {jobCard.jobNumber}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {jobCard.description}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400 print:text-sm">
                Created {fmtDate(jobCard.createdAt)}
              </span>
              <StatusBadge
                status={jobCard.status.replace("_", " ")}
                tone={tone}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField
              icon={<Building2 className="size-4" />}
              label="Branch"
              value={jobCard.branch?.name}
            />
            <DetailField
              icon={<User className="size-4" />}
              label="Created By"
              value={jobCard.createdBy?.firstName}
            />
            <DetailField
              icon={<Wrench className="size-4" />}
              label="Mechanic / team"
              value={
                jobCard.technician
                  ? `${jobCard.technician.firstName} ${jobCard.technician.lastName}`
                  : jobCard.team?.description
              }
            />
            <DetailField
              icon={<Clock className="size-4" />}
              label="Updated"
              value={fmtDate(jobCard.updatedAt)}
            />
          </div>
        </div>

        {/* ── Customer & Vehicle ── */}
        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard icon={<User className="size-4" />} title="Customer">
            <div className="space-y-2 text-sm">
              <p className="font-medium text-slate-800">{customerName}</p>
              <p className="text-slate-500">
                {jobCard.customer?.phoneNumber ?? "No mobile recorded"}
              </p>
              {jobCard.customer?.email && (
                <p className="text-slate-500">{jobCard.customer.email}</p>
              )}
              {jobCard.customer && (
                <Link
                  href={`/customers/${jobCard.customer.id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  View full profile
                </Link>
              )}
            </div>
          </SectionCard>

          <SectionCard icon={<Car className="size-4" />} title="Vehicle">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                  Reg No
                </p>
                <p className="text-slate-800">
                  {jobCard.vehicle?.registrationNumber ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                  Make / Model
                </p>
                <p className="text-slate-800">{vehicleLabel}</p>
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                  VIN
                </p>
                <p className="text-slate-800">{jobCard.vehicle?.vin ?? "—"}</p>
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                  Color
                </p>
                <p className="text-slate-800">
                  {jobCard.vehicle?.color ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                  Year
                </p>
                <p className="text-slate-800">{jobCard.vehicle?.year ?? "—"}</p>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Job Specs ── */}
        <SectionCard icon={<Gauge className="size-4" />} title="Job Specs">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                Estimated Hours
              </p>
              <p className="mt-0.5 text-sm text-slate-800">
                {jobCard.estimatedHours ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                Estimated Cost
              </p>
              <p className="mt-0.5 text-sm text-slate-800">
                {jobCard.estimatedCost != null
                  ? fmtCurrency(jobCard.estimatedCost)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                QC Status
              </p>
              <p className="mt-0.5 text-sm text-slate-800 capitalize">
                {jobCard.qcStatus?.replace("_", " ") ?? ""}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                Appointment
              </p>
              <p className="mt-0.5 text-sm text-slate-800">
                {jobCard.appointment
                  ? fmtDate(jobCard.appointment.scheduledAt)
                  : ""}
              </p>
            </div>
          </div>
          {jobCard.qcNotes && (
            <div className="mt-3">
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                QC Notes
              </p>
              <p className="mt-0.5 text-sm text-slate-600">{jobCard.qcNotes}</p>
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon={<ClipboardCheck className="size-4" />}
          title="Opening details"
        >
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Estimated parts", jobCard.estimatedParts],
                ["Estimated oil", jobCard.estimatedOil],
                ["Estimated labour", jobCard.estimatedLabour],
                ["Service charge", jobCard.serviceCharge],
              ] as const
            ).map(([label, amount]) => (
              <div key={label}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-medium">
                  {amount == null ? "Not recorded" : fmtCurrency(amount)}
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-sm text-muted-foreground">Received by</dt>
              <dd className="text-sm">
                {jobCard.serviceAdvisor
                  ? `${jobCard.serviceAdvisor.firstName} ${jobCard.serviceAdvisor.lastName}`
                  : "Not recorded"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Delivered by</dt>
              <dd className="text-sm">
                {jobCard.deliveryAdvisor
                  ? `${jobCard.deliveryAdvisor.firstName} ${jobCard.deliveryAdvisor.lastName}`
                  : "Awaiting delivery"}
              </dd>
            </div>
          </dl>
          {(jobCard.tyres?.some((tyre) => tyre.make || tyre.number) ||
            jobCard.batteryMake ||
            jobCard.batteryNumber ||
            jobCard.customField1) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {jobCard.tyres?.map(
                (tyre, index) =>
                  (tyre.make || tyre.number) && (
                    <div key={index}>
                      <p className="text-sm text-muted-foreground">
                        Tyre {index + 1}
                      </p>
                      <p className="text-sm">
                        {tyre.make || "Make not recorded"} /{" "}
                        {tyre.number || "Number not recorded"}
                      </p>
                    </div>
                  ),
              )}
              {(jobCard.batteryMake || jobCard.batteryNumber) && (
                <div>
                  <p className="text-sm text-muted-foreground">Battery</p>
                  <p className="text-sm">
                    {jobCard.batteryMake || "Make not recorded"} /{" "}
                    {jobCard.batteryNumber || "Number not recorded"}
                  </p>
                </div>
              )}
              {jobCard.customField1 && (
                <div>
                  <p className="text-sm text-muted-foreground">Custom field</p>
                  <p className="text-sm">{jobCard.customField1}</p>
                </div>
              )}
            </div>
          )}
          {jobCard.checklist && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">
                Checklist to be followed
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {jobCard.checklist}
              </p>
            </div>
          )}
          {jobCard.remarks && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Remarks</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {jobCard.remarks}
              </p>
            </div>
          )}
        </SectionCard>

        {canManage && <JobCardEditForm jobCard={jobCard} />}
        <section className="rounded-xl border bg-white p-5 space-y-2">
          <h2 className="font-semibold">Workshop record</h2>
          <p>
            Service:{" "}
            {jobCard.service?.name ??
              jobCard.serviceType?.description ??
              "Not recorded"}{" "}
            · Bay: {jobCard.bay?.description ?? "Not recorded"} · Mileage:{" "}
            {jobCard.mileage ?? "Not recorded"} km
          </p>
          <p>
            Promised:{" "}
            {jobCard.promisedAt ? fmtDate(jobCard.promisedAt) : "Not recorded"}{" "}
            · Ready:{" "}
            {jobCard.readyAt
              ? fmtDate(jobCard.readyAt)
              : "Awaiting quality check"}
          </p>
          <p className="text-sm">
            A/C fitted:{" "}
            {jobCard.acFitted == null
              ? "Not recorded"
              : jobCard.acFitted
                ? "Yes"
                : "No"}{" "}
            · In-house:{" "}
            {jobCard.inHouse == null
              ? "Not recorded"
              : jobCard.inHouse
                ? "Yes"
                : "No"}
          </p>
          <h3 className="text-sm font-semibold">Customer requests</h3>
          {jobCard.complaints?.map((complaint) => (
            <p key={complaint.id} className="whitespace-pre-wrap text-sm">
              {complaint.defectCode ? `${complaint.defectCode} — ` : ""}
              {complaint.description}
            </p>
          ))}
          {jobCard.isRepeat && (
            <p>
              Repeat job: {jobCard.repeatReason}{" "}
              {jobCard.previousJob && (
                <Link
                  className="text-primary underline"
                  href={`/job-cards/${jobCard.previousJob.id}`}
                >
                  {jobCard.previousJob.jobNumber} (
                  {jobCard.previousJob.technician?.firstName}{" "}
                  {jobCard.previousJob.technician?.lastName})
                </Link>
              )}
            </p>
          )}
          {jobCard.observations && (
            <div>
              <h3 className="text-sm font-semibold">Observations</h3>
              <p className="whitespace-pre-wrap text-sm">
                {jobCard.observations}
              </p>
            </div>
          )}
          {jobCard.workDone && (
            <div>
              <h3 className="text-sm font-semibold">
                Work done and recommendations
              </h3>
              <p className="whitespace-pre-wrap text-sm">{jobCard.workDone}</p>
            </div>
          )}
          {jobCard.statusHistory?.map((entry) => (
            <p className="text-sm text-slate-500" key={entry.id}>
              {fmtDate(entry.createdAt)} · {entry.toStatus.replaceAll("_", " ")}{" "}
              · {entry.actor.firstName} {entry.actor.lastName}
              {entry.remarks ? ` · ${entry.remarks}` : ""}
            </p>
          ))}
        </section>
        {jobCard.gatePassNumber && (
          <section className="job-gate-pass space-y-3 rounded-lg border-2 bg-white p-5">
            <h2 className="text-lg font-semibold">
              Gate pass {jobCard.gatePassNumber}
            </h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Job card" value={jobCard.jobNumber} />
              <DetailField label="Branch" value={jobCard.branch?.name} />
              <DetailField label="Customer" value={customerName} />
              <DetailField label="Vehicle" value={vehicleLabel} />
              <DetailField
                label="Registration / VIN"
                value={
                  jobCard.vehicle?.registrationNumber || jobCard.vehicle?.vin
                }
              />
              <DetailField
                label="Delivered"
                value={
                  jobCard.deliveredAt
                    ? fmtDate(jobCard.deliveredAt)
                    : "Not recorded"
                }
              />
              <DetailField
                label="Delivery advisor"
                value={
                  jobCard.deliveryAdvisor
                    ? `${jobCard.deliveryAdvisor.firstName} ${jobCard.deliveryAdvisor.lastName}`
                    : "Not recorded"
                }
              />
            </dl>
          </section>
        )}
        <JobCardPartsSection jobCard={jobCard} />
        <JobCardEstimateSection jobCard={jobCard} />
        <JobCardLabourSection
          jobCardId={jobCard.id}
          status={jobCard.status}
          branchId={jobCard.branchId}
          billedAt={jobCard.billedAt}
        />

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

          <SectionCard
            icon={<ClipboardCheck className="size-4" />}
            title="Quality Inspector"
          >
            {jobCard.qualityInspector ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-slate-800">
                  {jobCard.qualityInspector.firstName}{" "}
                  {jobCard.qualityInspector.lastName}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Not assigned</p>
            )}
          </SectionCard>
        </div>

        {/* ── Inspections ── */}
        {jobCard.inspections && jobCard.inspections.length > 0 && (
          <SectionCard
            icon={<SearchCheckIcon />}
            title={`Inspections (${jobCard.inspections.length})`}
          >
            <div className="space-y-3">
              {jobCard.inspections.map((insp) => (
                <div
                  key={insp.id}
                  className="rounded-lg border border-slate-100 p-3"
                >
                  <div className="flex items-center gap-2">
                    {insp.passed === true ? (
                      <CheckCircle className="size-5 text-emerald-600" />
                    ) : insp.passed === false ? (
                      <XCircle className="size-5 text-red-600" />
                    ) : (
                      <Loader2 className="size-5 animate-spin text-slate-400" />
                    )}
                    <span className="text-sm font-medium text-slate-700 capitalize">
                      {insp.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600">
                    {insp.findings}
                  </p>
                  {insp.notes && (
                    <p className="mt-1 text-sm text-slate-400">{insp.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── Parts Issued ── */}
        {jobCard.partIssuances && jobCard.partIssuances.length > 0 && (
          <SectionCard
            icon={<Package className="size-4" />}
            title={`Parts Issued (${jobCard.partIssuances.length})`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-sm font-semibold text-slate-500">
                      Part #
                    </th>
                    <th className="px-3 py-2 text-left text-sm font-semibold text-slate-500">
                      Name
                    </th>
                    <th className="px-3 py-2 text-right text-sm font-semibold text-slate-500">
                      Qty
                    </th>
                    <th className="px-3 py-2 text-right text-sm font-semibold text-slate-500">
                      Retail Rate
                    </th>
                    <th className="px-3 py-2 text-right text-sm font-semibold text-slate-500">
                      Total
                    </th>
                    <th className="px-3 py-2 text-left text-sm font-semibold text-slate-500">
                      Issued By
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobCard.partIssuances.map((pi) => (
                    <PartIssuanceRow key={pi.id} issuance={pi} />
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200">
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-2 text-right text-sm font-semibold text-slate-600"
                    >
                      Total Parts Cost
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-slate-800">
                      {totalPartsCost == null
                        ? "Retail rate not set"
                        : fmtCurrency(totalPartsCost)}
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
          <SectionCard
            icon={<FileText className="size-4" />}
            title={`Invoices (${jobCard.invoices.length})`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-sm font-semibold text-slate-500">
                      Invoice #
                    </th>
                    <th className="px-3 py-2 text-left text-sm font-semibold text-slate-500">
                      Date
                    </th>
                    <th className="px-3 py-2 text-right text-sm font-semibold text-slate-500">
                      Total
                    </th>
                    <th className="px-3 py-2 text-left text-sm font-semibold text-slate-500">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-sm font-semibold text-slate-500">
                      Paid
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobCard.invoices.map((inv) => (
                    <InvoiceRow key={inv.id} invoice={inv} />
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200">
                  <tr>
                    <td
                      colSpan={2}
                      className="px-3 py-2 text-right text-sm font-semibold text-slate-600"
                    >
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
            <SectionCard
              icon={<FileText className="size-4" />}
              title="Activity"
            >
              <p className="text-sm text-slate-400">
                No inspections, estimates, parts, or invoices recorded yet.
              </p>
            </SectionCard>
          )}
      </div>

      {/* ── Print Styles ── */}
      <style jsx global>{`
        @media print {
          body[data-job-card-print="gate-pass"]
            .job-card-print-content
            > :not(.job-gate-pass) {
            display: none !important;
          }
          html,
          body {
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
          header,
          aside,
          nav[aria-label="Mobile navigation"] {
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
          .space-y-4 > * + * {
            margin-top: 0.875rem !important;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SearchCheckIcon() {
  return (
    <svg
      className="size-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM10.5 7.5v6m3-3h-6"
      />
    </svg>
  );
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 md:p-5 print:border print:shadow-none">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function DetailField({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string | number | null;
}) {
  return (
    <div>
      {icon && <span className="inline-flex items-center gap-1.5">{icon}</span>}
      <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-slate-700">{value ?? "—"}</p>
    </div>
  );
}

//Todo implement Retail rate

function PartIssuanceRow({ issuance }: { issuance: PartIssuance }) {
  const returnedQty =
    issuance.returns?.reduce(
      (sum, partReturn) =>
        sum +
        (partReturn.status.toUpperCase() === "REJECTED"
          ? 0
          : partReturn.quantity),
      0,
    ) ?? 0;
  const netQuantity = Math.max(issuance.quantity - returnedQty, 0);
  const retailRate = issuance.sparePart?.retailRate;
  const lineTotal = retailRate == null ? null : retailRate * netQuantity;
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 font-medium text-slate-700">
        {issuance.sparePart?.partNumber ?? ""}
      </td>
      <td className="px-3 py-2 text-slate-600">
        {issuance.sparePart?.name ?? ""}
      </td>
      <td className="px-3 py-2 text-right text-slate-700">
        {issuance.quantity}
        {returnedQty > 0 && (
          <span className="ml-1 text-sm text-slate-400">(-{returnedQty})</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-slate-600">
        {retailRate == null ? "Not set" : fmtCurrency(retailRate)}
      </td>
      <td className="px-3 py-2 text-right font-medium text-slate-800">
        {lineTotal == null ? "—" : fmtCurrency(lineTotal)}
      </td>
      <td className="px-3 py-2 text-slate-600">
        {issuance.issuedBy?.firstName ?? "—"}
      </td>
    </tr>
  );
}

function InvoiceRow({ invoice }: { invoice: JobCardInvoice }) {
  const totalPaid =
    (invoice.payments as { amount: number }[])?.reduce(
      (s, p) => s + p.amount,
      0,
    ) ?? 0;
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 font-medium text-slate-700">
        <Link
          href={`/invoices/${invoice.id}`}
          className="text-primary hover:underline"
        >
          {invoice.invoiceNumber}
        </Link>
      </td>
      <td className="px-3 py-2 text-slate-600">
        {new Date(invoice.issuedDate).toLocaleDateString()}
      </td>
      <td className="px-3 py-2 text-right font-medium text-slate-800">
        {invoice.total.toLocaleString()}
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-sm font-medium capitalize ${
            invoice.status === "Paid"
              ? "bg-emerald-50 text-emerald-700"
              : invoice.status === "Unpaid"
                ? "bg-amber-50 text-amber-700"
                : "bg-blue-50 text-blue-700"
          }`}
        >
          {invoice.status}
        </span>
      </td>
      <td className="px-3 py-2 text-slate-600">
        {totalPaid > 0 ? fmtCurrency(totalPaid) : "—"}
      </td>
    </tr>
  );
}
