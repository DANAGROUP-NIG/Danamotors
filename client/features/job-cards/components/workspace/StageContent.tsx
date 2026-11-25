"use client";
import Link from "next/link";
import { Loader2, Package, Printer, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { ServiceTransactions } from "@/features/service-transactions/components/ServiceTransactions";
import { formatDateTime } from "@/lib/format";
import { useRequestJobCardParts } from "../../hooks/use-request-job-card-parts";
import { canonicalJobStatus, hasJobBill } from "../../types/job-card-status";
import type { JobCard } from "../../types/job-card.types";
import type { JobWorkspace } from "../../types/job-workspace.types";
import { JobAdvanceSection } from "../JobAdvanceSection";
import { JobCardEstimateSection } from "../JobCardEstimateSection";
import { JobCardLabourSection } from "../JobCardLabourSection";
import { JobCardLinesCard } from "../JobCardLinesCard";
import { JobCardPartsSection } from "../JobCardPartsSection";
import { WarrantySnapshotCard } from "../JobCardWarrantyCards";
import { JobOpeningConsentCard } from "../JobOpeningConsentCard";
import { WORKSPACE_COPY } from "../repair-workspace-copy";
import { InvoicesTable } from "./InvoicesTable";
import { StageCard } from "./StageCard";
import {
  AssignTechnicianSection,
  CreditApprovalSection,
  DeliverySection,
  FindingsSection,
  QualityCheckSection,
} from "./WorkshopSections";

const ACTIVE_INVOICE = (status: string) => !["CANCELLED", "CANCELED", "VOID"].includes(status.toUpperCase());

/**
 * What the current step shows. Steps not rebuilt yet show the existing sections that serve them,
 * so the app stays usable; each later phase replaces its step here.
 */
export function StageContent({ job, workspace, onPrintGatePass }: { job: JobCard; workspace: JobWorkspace; onPrintGatePass: () => void }) {
  switch (workspace.stage) {
    case "CHECK_IN":
    // TODO(phase 2): replaced by the Details, Walk-around and Customer consent steps.
    case "ESTIMATE":
      // TODO(phase 5): replaced by the estimate, item approval, advance and release screens.
      return <OpeningEstimateAdvance job={job} />;
    case "DIAGNOSIS":
      // TODO(phase 3): replaced by allocation, technician findings and engineer review.
      return (
        <>
          <AssignTechnicianSection job={job} />
          <FindingsSection job={job} />
          <OpeningEstimateAdvance job={job} />
        </>
      );
    case "WARRANTY":
      // TODO(phase 4): replaced by the warranty decision screen and the service history rule.
      return <WarrantyReview job={job} />;
    case "REPAIR":
      // TODO(phase 6): replaced by the technician repair view, parts collection and supplementary estimate.
      return (
        <>
          <RequestPartsBar job={job} />
          <ServiceTransactions job={job} />
          <JobCardPartsSection jobCard={job} />
          <JobCardLabourSection jobCard={job} />
          <AssignTechnicianSection job={job} />
        </>
      );
    case "QUALITY_CHECK":
      // TODO(phase 7): replaced by the quality check screen with road test and certification.
      return (
        <>
          <QualityCheckSection job={job} />
          <FindingsSection job={job} />
        </>
      );
    case "BILLING":
      // TODO(phase 8): replaced by mark ready, storage, estimated against actual, invoice and payment.
      return (
        <>
          <BillingSection job={job} />
          <CreditApprovalSection job={job} />
        </>
      );
    case "DELIVERY":
      // TODO(phase 9): replaced by the handover, belongings, signature and gate pass screen.
      return (
        <>
          <DeliverySection job={job} />
          <BillingSection job={job} />
          <CreditApprovalSection job={job} />
        </>
      );
    case "CLOSED":
      return <DeliveredPanel job={job} onPrintGatePass={onPrintGatePass} />;
    case "CANCELLED":
      return null;
  }
}

function OpeningEstimateAdvance({ job }: { job: JobCard }) {
  const status = canonicalJobStatus(job.status);
  const closed = hasJobBill(job) || ["BILLED", "DELIVERED", "CANCELLED"].includes(status);
  return (
    <>
      <JobOpeningConsentCard jobCardId={job.id} closed={closed} />
      {job.estimates ? (
        <JobCardEstimateSection jobCard={job} />
      ) : (
        <StageCard title="Estimate">
          <p className="text-sm text-muted-foreground">{WORKSPACE_COPY.noAccess}</p>
        </StageCard>
      )}
      {(job.advanceSummary || job.advanceReceipts) && <JobAdvanceSection jobCard={job} open={!closed} />}
    </>
  );
}

function WarrantyReview({ job }: { job: JobCard }) {
  const { hasPermission, isSuperAdmin } = useAuth();
  const canSeeWarranty = isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.READ);
  return (
    <>
      {canSeeWarranty ? (
        <WarrantySnapshotCard jobCard={job} />
      ) : (
        <StageCard title="Warranty check">
          <p className="text-sm text-muted-foreground">The warranty officer is checking the vehicle&apos;s cover. Details are shown to staff with warranty access.</p>
        </StageCard>
      )}
      <JobCardLinesCard jobCardId={job.id} />
    </>
  );
}

function RequestPartsBar({ job }: { job: JobCard }) {
  const { hasPermission } = useAuth();
  const request = useRequestJobCardParts(job.id);
  const status = canonicalJobStatus(job.status);
  const allowed =
    (hasPermission("partissuance:create") || hasPermission("partreturn:create")) &&
    !hasJobBill(job) &&
    !["DELIVERED", "CANCELLED"].includes(status);
  if (!allowed) return null;
  return (
    <StageCard
      title="Parts"
      description="Tell the branch store manager that this job needs parts. Prepare the requisition in Service transactions."
      actions={
        <Button
          type="button"
          variant="outline"
          disabled={request.isPending}
          onClick={() => {
            if (!request.isPending) request.mutate(crypto.randomUUID());
          }}
        >
          {request.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Package aria-hidden="true" />}
          {request.isPending ? "Sending request" : "Request part"}
        </Button>
      }
    >
      {job.partsRequestedAt ? (
        <p className="text-sm">Parts last requested {formatDateTime(job.partsRequestedAt)}.</p>
      ) : (
        <p className="text-sm text-muted-foreground">No parts request has been sent for this job.</p>
      )}
    </StageCard>
  );
}

function BillingSection({ job }: { job: JobCard }) {
  const { hasPermission } = useAuth();
  const status = canonicalJobStatus(job.status);
  const invoices = job.invoices ?? [];
  const activeBill = !!job.billedAt || invoices.some((invoice) => ACTIVE_INVOICE(invoice.status));
  const canCreate = hasPermission("invoice:job-bill:create");
  const ready = status === "READY" || (status === "DELIVERED" && !!job.creditApprovedById);
  const reason = activeBill ? null : !ready ? "Mark the vehicle ready before creating the bill." : null;
  return (
    <StageCard
      title="Bill"
      actions={
        canCreate && !activeBill ? (
          ready ? (
            <Button asChild>
              <Link href={`/invoices/new?jobCardId=${job.id}&customerId=${job.customerId}`}>
                <Receipt aria-hidden="true" />
                Create job bill
              </Link>
            </Button>
          ) : (
            <Button type="button" disabled aria-describedby="bill-blocked">
              <Receipt aria-hidden="true" />
              Create job bill
            </Button>
          )
        ) : undefined
      }
    >
      {canCreate && reason && (
        <p id="bill-blocked" className="text-sm text-muted-foreground">
          {reason}
        </p>
      )}
      <InvoicesTable invoices={invoices} />
    </StageCard>
  );
}

function DeliveredPanel({ job, onPrintGatePass }: { job: JobCard; onPrintGatePass: () => void }) {
  return (
    <>
      <StageCard
        title="Delivered"
        actions={
          job.gatePassNumber ? (
            <Button type="button" variant="outline" onClick={onPrintGatePass}>
              <Printer aria-hidden="true" />
              Print gate pass
            </Button>
          ) : undefined
        }
      >
        <p className="text-sm">
          Delivered {formatDateTime(job.deliveredAt)}
          {job.deliveryAdvisor ? ` by ${job.deliveryAdvisor.firstName} ${job.deliveryAdvisor.lastName}` : ""}.
          {job.gatePassNumber ? ` Gate pass ${job.gatePassNumber}.` : ""}
        </p>
      </StageCard>
      <StageCard title="Bill">
        <InvoicesTable invoices={job.invoices ?? []} />
      </StageCard>
    </>
  );
}
