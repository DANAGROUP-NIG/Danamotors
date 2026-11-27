"use client";
import { CustomerExplanation } from "@/components/CustomerExplanation";
import { customerCategoryLabel } from "@/features/customers/lib/customer-category";
import {
  JOB_CARD_STATUS_TONES,
  JOB_CARD_STATUS_LABELS,
  canonicalJobStatus,
  hasJobBill,
} from "@/features/job-cards/types/job-card-status";
import { JobCardPartsSection } from "@/features/job-cards/components/JobCardPartsSection";
import { RepairWorkspacePage } from "@/features/job-cards/components/RepairWorkspacePage";
import { JobCardEditForm } from "@/features/job-cards/components/JobCardEditForm";
// TEMPORARILY DISABLED: Restore this import and the JobOpeningConsentCard below together.
// import { JobOpeningConsentCard } from "@/features/job-cards/components/JobOpeningConsentCard";
import { useJobOpeningConsent } from "@/features/job-cards/hooks/use-job-opening-consent";
import {
  lagosDate,
  moneyText,
} from "@/features/service-transactions/transaction.logic";
import { WORKSPACE_COPY } from "@/features/job-cards/components/repair-workspace-copy";
import { JobCardRepeatPanel } from "@/features/repeat-jobs/components/JobCardRepeatPanel";
import { JobCardLatePanel } from "@/features/late-deliveries/components/JobCardLatePanel";
import { RepeatTag } from "@/features/repeat-jobs/components/repeat-ui";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { sumMoney } from "@/features/pdi/lib/pdi.logic";
import {
  JobProgressStepper,
  StatusPill,
} from "@/features/job-cards/components/repair-workspace-ui";
import { useJobCard } from "@/features/job-cards";
import { useRequestJobCardParts } from "@/features/job-cards/hooks/use-request-job-card-parts";
import { useJobCardWorkflow } from "@/features/job-cards/hooks/use-job-card-workflow";
import {
  JobCardTechnicianAssignment,
  JobCardWorkflowPanel,
} from "@/features/job-cards/components/JobCardWorkflowPanel";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { canViewJobCardSection } from "@/features/auth/job-card-section-access";
import {
  ArrowLeft,
  Loader2,
  Printer,
  FileText,
  Package,
  User,
  Car,
  ClipboardCheck,
  Receipt,
  Gauge,
  CheckCircle,
  XCircle,
  ChevronDown,
  SearchCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  JobCardStatus,
  PartIssuance,
  JobCardInvoice,
} from "@/features/job-cards/types/job-card.types";
import { JobCardLabourSection } from "@/features/job-cards/components/JobCardLabourSection";
import { JobCardLinesCard } from "@/features/job-cards/components/JobCardLinesCard";
import { partSourceLabel } from "@/features/inventory/lib/part-codes";
import {
  CampaignPrintBox,
  LinkedCampaignsCard,
  WarrantySnapshotCard,
} from "@/features/job-cards/components/JobCardWarrantyCards";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";

const STATUS_TONES = JOB_CARD_STATUS_TONES;

function fmtDate(iso?: string | null) {
  return iso && Number.isFinite(Date.parse(iso))
    ? lagosDate(iso)
    : "Not recorded";
}

function fmtCurrency(n?: number | null) {
  return n != null && Number.isFinite(Number(n))
    ? moneyText(n)
    : "Not recorded";
}

export default function JobCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const workflowTab = useSearchParams().get("tab");
  const { data: jobCard, isLoading, error } = useJobCard(id);
  const requestParts = useRequestJobCardParts(id);
  const workflowQuery = useJobCardWorkflow(id);
  const workflow = workflowQuery.data;
  const hasWorkflow = Boolean(workflow);
  const useLegacyActions = workflowQuery.isSuccess && workflow === null;
  const { hasPermission, isSuperAdmin, isHydrated, user } = useAuth();
  const roles = isHydrated && user
    ? [user.role, ...("roles" in user && Array.isArray(user.roles)
      ? user.roles.filter((role): role is string => typeof role === "string")
      : [])]
    : [];
  const showWorkshopActions = canViewJobCardSection(roles, "workshop");
  const showFinanceSections = canViewJobCardSection(roles, "finance");
  // Keep the existing opening-consent read while its UI is temporarily disabled.
  useJobOpeningConsent(id, !isLoading && !error && Boolean(jobCard) && hasPermission("jobcard:read"));

  const canManage = hasPermission("jobcard:update");
  const canCreateBill = hasPermission("invoice:job-bill:create");
  const canSeeWarranty =
    isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.READ);

  useEffect(() => {
    if (!hasWorkflow || !workflowTab) return;
    const targets: Record<string, string> = {
      labour: "transaction-panel-Labour",
      history: "transaction-panel-History",
      warranty: "workflow-warranty",
      estimate: "estimate-approval",
      parts: "workflow-parts",
      qc: "workflow-qc",
      billing: "workflow-billing",
    };
    if (targets[workflowTab])
      document
        .getElementById(targets[workflowTab])
        ?.scrollIntoView({ block: "start" });
  }, [hasWorkflow, workflowTab]);

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
    if (!requestParts.isPending) requestParts.mutate(crypto.randomUUID());
  }

  if (isLoading || error || !jobCard)
    return (
      <div className="p-4 lg:p-5">
        <RepairWorkspacePage id={id} showAdvancePayments={showFinanceSections} />
      </div>
    );

  const tone = STATUS_TONES[jobCard.status as JobCardStatus] ?? "gray";
  const hasCampaigns = (jobCard.campaigns?.length ?? 0) > 0;
  const vehicleLabel = jobCard.vehicle
    ? `${jobCard.vehicle.year ?? ""} ${jobCard.vehicle.make ?? ""} ${jobCard.vehicle.model ?? ""}`.trim() ||
      "Not recorded"
    : "Not recorded";
  const customerName = jobCard.customer
    ? jobCard.customer.companyName ||
      `${jobCard.customer.firstName ?? ""} ${jobCard.customer.lastName ?? ""}`.trim() ||
      "Not recorded"
    : "Not recorded";
  const issuedAmounts = (jobCard.partIssuances ?? []).map(issuanceAmount);
  const totalPartsCost = issuedAmounts.some((amount) => amount == null)
    ? null
    : sumMoney(issuedAmounts);
  const totalInvoiced = sumMoney(
    (jobCard.invoices ?? [])
      .filter(
        (invoice) =>
          !["CANCELLED", "CANCELED", "VOID"].includes(
            invoice.status.toUpperCase(),
          ),
      )
      .map((invoice) => invoice.total),
  );
  const qcLabel =
    WORKSPACE_COPY.qcStates[
      (jobCard.qcStatus?.toUpperCase() ??
        "") as keyof typeof WORKSPACE_COPY.qcStates
    ] ?? "Not recorded";
  const qcTone =
    jobCard.qcStatus?.toUpperCase() === "PASSED"
      ? "emerald"
      : jobCard.qcStatus?.toUpperCase() === "FAILED"
        ? "red"
        : jobCard.qcStatus
          ? "amber"
          : "gray";
  const summary = jobCard.advanceSummary;
  const currentStatus = canonicalJobStatus(jobCard.status);
  const latestEstimate = jobCard.estimates?.[0];
  const needsApproval =
    latestEstimate?.status !== "Approved" ||
    latestEstimate.approvals?.some(
      (approval) => approval.signatureState === "invalid",
    );
  const canReviewWorkshop =
    canManage && !["DELIVERED", "CANCELLED"].includes(currentStatus);

  return (
    <div className="min-w-0 px-4 lg:px-5 print:px-0">
      <div className="job-card-header xl:sticky top-0 z-10 -mx-4 space-y-3 border-b border-border bg-card px-4 py-3 sm:py-4 lg:-mx-5 lg:px-5 print:static print:mx-0 print:px-0">
        <Link
          href="/job-cards"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to job cards
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-all text-2xl font-semibold tracking-tight sm:text-3xl">
                {jobCard.jobNumber}
              </h1>
              <StatusPill
                label={
                  JOB_CARD_STATUS_LABELS[jobCard.status as JobCardStatus]
                    ?.toLowerCase()
                    .replace(/^./, (letter) => letter.toUpperCase()) ??
                  "Status unavailable"
                }
                tone={tone}
              />
              {jobCard.repeatRecord && (
                <RepeatTag
                  status={jobCard.repeatRecord.status}
                  className="text-xs"
                />
              )}
            </div>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {jobCard.description && (
                <strong className="mr-3 font-medium text-foreground">
                  {jobCard.description}
                </strong>
              )}
              Created {fmtDate(jobCard.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            {showWorkshopActions && canReviewWorkshop && useLegacyActions && (
              <Button size="sm" asChild>
                <a href="#workshop-actions">Workshop actions</a>
              </Button>
            )}
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
                  useLegacyActions &&
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
                      <Receipt className="size-4" /> Create job bill
                    </Button>
                  )}
                {useLegacyActions &&
                  (hasPermission("partissuance:create") ||
                    hasPermission("partreturn:create")) &&
                  !hasJobBill(jobCard) &&
                  !["DELIVERED", "CANCELLED"].includes(
                    canonicalJobStatus(jobCard.status),
                  ) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRequestParts}
                      disabled={requestParts.isPending}
                      className="gap-1.5"
                    >
                      {requestParts.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Package className="size-4" />
                      )}
                      {requestParts.isPending
                        ? "Sending request"
                        : "Request part"}
                    </Button>
                  )}
              </>
            )}
          </div>
        </div>
        {useLegacyActions && (
          <JobProgressStepper status={jobCard.status} embedded />
        )}
        <JobCardWorkflowPanel
          query={workflowQuery}
          jobCardId={id}
          customerId={jobCard.customerId}
          ignoreOpeningApproval
        />
      </div>
      <div className="space-y-4 py-4 print:hidden">
        {/* TEMPORARILY DISABLED: Job-opening approval hidden from UI.
            Restore this block and remove the standalone consent read and approval bypasses.
        <JobOpeningConsentCard
          jobCardId={id}
          embedded
          closed={
            hasJobBill(jobCard) ||
            ["DELIVERED", "CANCELLED"].includes(
              canonicalJobStatus(jobCard.status),
            )
          }
        />
        */}
        {useLegacyActions &&
          canReviewWorkshop &&
          jobCard.estimates &&
          !hasJobBill(jobCard) &&
          needsApproval && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p>
                <strong>Estimate approval required.</strong> Approve the latest
                estimate before starting or completing work.
              </p>
              <a href="#estimate-approval" className="font-medium underline">
                Review estimate
              </a>
            </div>
          )}
        <dl
          aria-label="Job summary"
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <SummaryItem
            label="Estimated cost"
            value={fmtCurrency(jobCard.estimatedCost)}
          />
          <SummaryItem
            label="Advances received"
            value={fmtCurrency(summary?.receivedAmount)}
          />
          <SummaryItem
            label={
              summary?.basis === "INVOICE"
                ? "Invoice balance"
                : "Estimated balance"
            }
            value={fmtCurrency(summary?.balanceAmount)}
          />
          <SummaryItem
            label="QC status"
            value={<StatusPill label={qcLabel} tone={qcTone} />}
          />
        </dl>
      </div>

      <div
        className="job-card-print-content grid min-w-0 gap-4 xl:grid-cols-3 print:block"
        data-job-card-layout
      >
        <div className="job-card-workspace min-w-0 space-y-4 xl:col-span-2">
          {workflowQuery.isSuccess && (
            <RepairWorkspacePage
              id={id}
              embedded
              workflow={workflow}
              showAdvancePayments={showFinanceSections}
              preferredTab={
                workflowTab === "labour"
                  ? "Labour"
                  : workflowTab === "parts"
                    ? "Requisition"
                    : workflowTab === "history"
                      ? "History"
                      : undefined
              }
              labourAssignment={
                workflow && (
                  <JobCardTechnicianAssignment
                    query={workflowQuery}
                    branchId={jobCard.branchId}
                  />
                )
              }
            />
          )}
          {/* Repeat block: previous job, days/km since and the review; prints when the branch setting is on. */}
          <JobCardRepeatPanel
            jobCardId={jobCard.id}
            enabled={Boolean(jobCard.repeatRecord || jobCard.isRepeat)}
            previousJob={jobCard.previousJob}
          />
          {/* Delivered after the promise: reasons, remark and a link to the late-delivery entry screen. */}
          <JobCardLatePanel jobCard={jobCard} />

          <CampaignPrintBox jobCard={jobCard} />

          <SectionCard
            icon={<ClipboardCheck className="size-4" />}
            title="Opening details"
          >
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
                    <p className="text-sm text-muted-foreground">
                      Custom field
                    </p>
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
              <div className="mt-4 print:hidden">
                <h3 className="text-sm font-semibold">Internal remarks</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {jobCard.remarks}
                </p>
              </div>
            )}
          </SectionCard>

          <CustomerExplanation text={jobCard.customerRemarks} />

          {useLegacyActions && canReviewWorkshop && (
            <JobCardEditForm
              jobCard={jobCard}
              showWorkshopActions={showWorkshopActions}
              ignoreOpeningApproval
            />
          )}
          <section className="space-y-2 break-words rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="font-semibold">Diagnosis and findings</h2>
            <h3 className="text-sm font-semibold">Customer requests</h3>
            {!jobCard.complaints?.length && (
              <p className="text-sm text-muted-foreground">
                No customer requests recorded.
              </p>
            )}
            {jobCard.complaints?.map((complaint) => (
              <p key={complaint.id} className="whitespace-pre-wrap text-sm">
                {complaint.defectCode ? `${complaint.defectCode} - ` : ""}
                {complaint.description}
              </p>
            ))}
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
                <p className="whitespace-pre-wrap text-sm">
                  {jobCard.workDone}
                </p>
              </div>
            )}
          </section>
          <SectionCard icon={<FileText className="size-4" />} title="Activity">
            {jobCard.statusHistory?.length ? (
              <ol className="space-y-3 border-l border-border pl-4">
                {jobCard.statusHistory.map((entry) => (
                  <li key={entry.id} className="break-words text-sm">
                    <p className="font-medium">
                      {JOB_CARD_STATUS_LABELS[entry.toStatus as JobCardStatus]
                        ?.toLowerCase()
                        .replace(/^./, (letter) => letter.toUpperCase()) ??
                        "Status unavailable"}
                    </p>
                    <p className="text-muted-foreground">
                      {fmtDate(entry.createdAt)}
                      {entry.actor &&
                        ` / ${[entry.actor.firstName, entry.actor.lastName].filter(Boolean).join(" ")}`}
                    </p>
                    {entry.remarks && (
                      <p className="whitespace-pre-wrap">{entry.remarks}</p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                No status updates recorded yet.
              </p>
            )}
          </SectionCard>
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
          {/* ── Inspections ── */}
          {jobCard.inspections && jobCard.inspections.length > 0 && (
            <SectionCard
              icon={<SearchCheck className="size-4" />}
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
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium text-slate-700 capitalize">
                        {insp.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-600">
                      {insp.findings}
                    </p>
                    {insp.notes && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {insp.notes}
                      </p>
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
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Issued parts table"
              >
                <table className="w-full text-sm [&_th]:whitespace-nowrap">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-muted-foreground">
                        Part #
                      </th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-muted-foreground">
                        Name
                      </th>
                      <th className="px-3 py-2 text-right text-sm tabular-nums font-semibold text-muted-foreground">
                        Qty
                      </th>
                      <th className="px-3 py-2 text-right text-sm tabular-nums font-semibold text-muted-foreground">
                        Retail Rate
                      </th>
                      <th className="px-3 py-2 text-right text-sm tabular-nums font-semibold text-muted-foreground">
                        Total
                      </th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-muted-foreground">
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
                        className="px-3 py-2 text-right text-sm tabular-nums font-semibold text-slate-600"
                      >
                        Total Parts Cost
                      </td>
                      <td className="px-3 py-2 text-right text-sm tabular-nums font-semibold text-slate-800">
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
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Invoices table"
              >
                <table className="w-full text-sm [&_th]:whitespace-nowrap">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-muted-foreground">
                        Invoice #
                      </th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-muted-foreground">
                        Date
                      </th>
                      <th className="px-3 py-2 text-right text-sm tabular-nums font-semibold text-muted-foreground">
                        Total
                      </th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-muted-foreground">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-muted-foreground">
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
                        className="px-3 py-2 text-right text-sm tabular-nums font-semibold text-slate-600"
                      >
                        Total Invoiced
                      </td>
                      <td className="px-3 py-2 text-right text-sm tabular-nums font-semibold text-slate-800">
                        {fmtCurrency(totalInvoiced)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </SectionCard>
          )}
        </div>
        <div
          role="region"
          aria-label="Job context"
          className="job-card-context min-w-0 space-y-4 xl:self-start print:mt-4"
        >
          {/* ── Customer & Vehicle ── */}
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <SectionCard
              icon={<User className="size-4" />}
              title="Customer"
              disclosure
            >
              <div className="space-y-2 break-words text-sm">
                <p className="font-medium">{customerName}</p>
                <dl>
                  <DetailField
                    label="Customer category"
                    value={customerCategoryLabel(jobCard.customer)}
                  />
                </dl>
                <p className="text-muted-foreground">
                  {jobCard.customer?.phoneNumber ?? "Not recorded"}
                </p>
                {jobCard.customer?.email && (
                  <p className="text-muted-foreground">
                    {jobCard.customer.email}
                  </p>
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

            <SectionCard
              icon={<Car className="size-4" />}
              title="Vehicle"
              disclosure
            >
              <div className="grid grid-cols-2 gap-2 break-words text-sm">
                <div>
                  <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    Reg No
                  </p>
                  <p className="text-slate-800">
                    {jobCard.vehicle?.registrationNumber ?? "Not recorded"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    Make / Model
                  </p>
                  <p className="text-slate-800">{vehicleLabel}</p>
                </div>
                <div>
                  <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    VIN
                  </p>
                  <p className="text-slate-800">
                    {jobCard.vehicle?.vin ?? "Not recorded"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    Color
                  </p>
                  <p className="text-slate-800">
                    {jobCard.vehicle?.color ?? "Not recorded"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    Year
                  </p>
                  <p className="text-slate-800">
                    {jobCard.vehicle?.year ?? "Not recorded"}
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* ── Job Specs ── */}
          <SectionCard
            icon={<Gauge className="size-4" />}
            title="Job specifications"
            disclosure
          >
            <dl className="grid grid-cols-2 gap-3">
              <DetailField
                label="Service"
                value={
                  jobCard.service?.name ?? jobCard.serviceType?.description
                }
              />
              <DetailField label="Bay" value={jobCard.bay?.description} />
              <DetailField
                label="Appointment"
                value={fmtDate(jobCard.appointment?.scheduledAt)}
              />
              <DetailField
                label="Promised"
                value={fmtDate(jobCard.promisedAt)}
              />
              <DetailField
                label="Ready"
                value={
                  jobCard.readyAt
                    ? fmtDate(jobCard.readyAt)
                    : "Awaiting quality check"
                }
              />
              <DetailField
                label="Mileage"
                value={
                  jobCard.mileage != null
                    ? `${jobCard.mileage.toLocaleString("en-NG")} km`
                    : null
                }
              />
              <DetailField
                label="Estimated hours"
                value={jobCard.estimatedHours}
              />
              <DetailField
                label="A/C fitted"
                value={
                  jobCard.acFitted == null
                    ? null
                    : jobCard.acFitted
                      ? "Yes"
                      : "No"
                }
              />
              <DetailField
                label="In-house"
                value={
                  jobCard.inHouse == null
                    ? null
                    : jobCard.inHouse
                      ? "Yes"
                      : "No"
                }
              />
              <DetailField label="QC status" value={qcLabel} />
              <DetailField
                label="Estimated cost"
                value={fmtCurrency(jobCard.estimatedCost)}
              />
            </dl>
            {jobCard.qcNotes && (
              <div className="mt-3">
                <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  QC Notes
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {jobCard.qcNotes}
                </p>
              </div>
            )}
          </SectionCard>

          {showFinanceSections && (
            <SectionCard
              icon={<Receipt className="size-4" />}
              title="Cost breakdown"
              disclosure
            >
              <dl className="grid grid-cols-2 gap-3 tabular-nums">
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
              </dl>
            </SectionCard>
          )}
          <SectionCard
            icon={<User className="size-4" />}
            title="People and assignment"
            disclosure
          >
            <dl className="grid grid-cols-2 gap-3">
              <DetailField label="Branch" value={jobCard.branch?.name} />
              <DetailField
                label="Created by"
                value={personName(jobCard.createdBy)}
              />
              <DetailField
                label="Received by"
                value={personName(jobCard.serviceAdvisor)}
              />
              <DetailField
                label="Delivered by"
                value={
                  personName(jobCard.deliveryAdvisor) ?? "Awaiting delivery"
                }
              />
              <DetailField
                label="Technician"
                value={personName(jobCard.technician) ?? "Not assigned"}
              />
              <DetailField
                label="Quality inspector"
                value={personName(jobCard.qualityInspector) ?? "Not assigned"}
              />
              <DetailField label="Team" value={jobCard.team?.description} />
              <DetailField label="Updated" value={fmtDate(jobCard.updatedAt)} />
            </dl>
          </SectionCard>
          {/* ── Warranty snapshot (warranty:read) & campaigns (every job card user; answering needs jobcard:update) ── */}
          {jobCard.vehicleId && (canSeeWarranty || hasCampaigns) && (
            <div
              className={cn("grid gap-5", canSeeWarranty && "md:grid-cols-2")}
            >
              {canSeeWarranty && <WarrantySnapshotCard jobCard={jobCard} />}
              <LinkedCampaignsCard
                jobCard={jobCard}
                canEdit={
                  canManage &&
                  !["DELIVERED", "CANCELLED"].includes(
                    canonicalJobStatus(jobCard.status),
                  )
                }
              />
            </div>
          )}

          <JobCardPartsSection jobCard={jobCard} />
          <JobCardLabourSection jobCard={jobCard} />

          {/* ── Who pays for each part and labour line (warranty, goodwill, campaign, customer) ── */}
          <JobCardLinesCard jobCardId={jobCard.id} />
        </div>
      </div>

      {/* ── Print Styles ── */}
      <style jsx global>{`
        @media print {
          body[data-job-card-print="gate-pass"]
            .job-card-workspace
            > :not(.job-gate-pass),
          body[data-job-card-print="gate-pass"] .job-card-context,
          body[data-job-card-print="gate-pass"] .job-card-header {
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
            border: 1px solid var(--border) !important;
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
          [data-job-card-layout] details::details-content {
            content-visibility: visible !important;
          }
          [data-job-card-layout] .space-y-4 > * + * {
            margin-top: 0.875rem !important;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function personName(person?: { firstName: string; lastName: string } | null) {
  return (
    [person?.firstName, person?.lastName].filter(Boolean).join(" ") || null
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2 break-words text-base font-semibold tabular-nums sm:text-xl">
        {value}
      </dd>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  children,
  disclosure = false,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  disclosure?: boolean;
}) {
  const cardClass =
    "min-w-0 rounded-xl border border-border bg-card text-card-foreground print:shadow-none";
  const headingClass = "flex items-center gap-2 text-base font-semibold";
  if (disclosure) {
    return (
      <details open className={cn(cardClass, "group")}>
        <summary
          className={cn(
            headingClass,
            "cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden",
          )}
        >
          {icon}
          {title}
          <ChevronDown
            className="ml-auto size-4 shrink-0 text-muted-foreground group-open:rotate-180 print:hidden"
            aria-hidden="true"
          />
        </summary>
        <div className="px-4 pb-4">{children}</div>
      </details>
    );
  }
  return (
    <section className={cn(cardClass, "p-4 sm:p-5")}>
      <h2 className={cn(headingClass, "mb-3")}>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">
        {value == null || value === "" ? "Not recorded" : value}
      </dd>
    </div>
  );
}

function returnedQuantity(issuance: PartIssuance) {
  return (issuance.returns ?? []).reduce(
    (sum, partReturn) =>
      sum +
      (partReturn.status.toUpperCase() === "REJECTED"
        ? 0
        : partReturn.quantity),
    0,
  );
}

function issuanceAmount(issuance: PartIssuance) {
  const quantity = Math.max(issuance.quantity - returnedQuantity(issuance), 0);
  const rate = issuance.sparePart?.retailRate;
  if (rate == null) return quantity ? null : 0;
  return (Math.round(rate * 100) * quantity) / 100;
}

function PartIssuanceRow({ issuance }: { issuance: PartIssuance }) {
  const returnedQty = returnedQuantity(issuance);
  const retailRate = issuance.sparePart?.retailRate;
  const lineTotal = issuanceAmount(issuance);
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 font-medium text-slate-700">
        {issuance.sparePart?.partNumber ?? ""}
      </td>
      <td className="px-3 py-2 text-slate-600">
        {issuance.sparePart?.name ?? ""}
        {/* The source is internal: never printed for the customer. */}
        {issuance.partSource && (
          <span className="block text-xs text-muted-foreground print:hidden">
            {partSourceLabel(issuance.partSource)}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
        {issuance.quantity}
        {returnedQty > 0 && (
          <span className="ml-1 text-sm text-muted-foreground">
            (-{returnedQty})
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
        {retailRate == null ? "Not set" : fmtCurrency(retailRate)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
        {lineTotal == null ? "Not recorded" : fmtCurrency(lineTotal)}
      </td>
      <td className="px-3 py-2 text-slate-600">
        {issuance.issuedBy?.firstName ?? "Not recorded"}
      </td>
    </tr>
  );
}

function InvoiceRow({ invoice }: { invoice: JobCardInvoice }) {
  const totalPaid = sumMoney(
    (invoice.payments as { amount: number }[] | undefined)?.map(
      (payment) => payment.amount,
    ) ?? [],
  );
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
        {fmtDate(invoice.issuedDate)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
        {fmtCurrency(invoice.total)}
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-sm font-medium capitalize ${
            invoice.status.toUpperCase() === "PAID"
              ? "bg-emerald-50 text-emerald-700"
              : invoice.status.toUpperCase() === "UNPAID"
                ? "bg-amber-50 text-amber-700"
                : "bg-blue-50 text-blue-700"
          }`}
        >
          {invoice.status?.toLowerCase().replaceAll("_", " ") ||
            "Status unavailable"}
        </span>
      </td>
      <td className="px-3 py-2 text-slate-600">
        {totalPaid > 0 ? fmtCurrency(totalPaid) : "Not recorded"}
      </td>
    </tr>
  );
}
