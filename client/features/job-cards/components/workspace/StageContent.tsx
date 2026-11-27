"use client";
import Link from "next/link";
import { Loader2, Package, Printer, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ServiceTransactions } from "@/features/service-transactions/components/ServiceTransactions";
import { formatDateTime } from "@/lib/format";
import { useRequestJobCardParts } from "../../hooks/use-request-job-card-parts";
import { canonicalJobStatus, hasJobBill } from "../../types/job-card-status";
import type { JobCard } from "../../types/job-card.types";
import type { JobWorkspace } from "../../types/job-workspace.types";
import type { JobFileTab } from "../../lib/job-frame.logic";
import { JobCardLabourSection } from "../JobCardLabourSection";
import { JobCardPartsSection } from "../JobCardPartsSection";
import { CheckInStep, type StageBarProps } from "../check-in/CheckInStep";
import { ConsentCatchUp } from "../check-in/ConsentCatchUp";
import { DiagnosisStep } from "../diagnosis/DiagnosisStep";
import { WarrantyStep } from "../warranty/WarrantyStep";
import { EstimateStep } from "../estimate/EstimateStep";
import { InvoicesTable } from "./InvoicesTable";
import { StageCard } from "./StageCard";
import {
  AssignTechnicianSection,
  CreditApprovalSection,
  DeliverySection,
  QualityCheckSection,
  WorkDoneSection,
} from "./WorkshopSections";

const ACTIVE_INVOICE = (status: string) => !["CANCELLED", "CANCELED", "VOID"].includes(status.toUpperCase());

/**
 * What the current step shows. Steps not rebuilt yet show the existing sections that serve them,
 * so the app stays usable; each later phase replaces its step here.
 */
export function StageContent({
  job,
  workspace,
  bar,
  onPrintGatePass,
  onOpenTab,
}: {
  job: JobCard;
  workspace: JobWorkspace;
  /** Check-in, Diagnosis and Warranty show the action bar themselves, with their own buttons. */
  bar: StageBarProps;
  onPrintGatePass: () => void;
  onOpenTab: (tab: JobFileTab) => void;
}) {
  switch (workspace.stage) {
    case "CHECK_IN":
      return <CheckInStep job={job} workspace={workspace} bar={bar} onOpenTab={onOpenTab} />;
    case "ESTIMATE":
      // PDI jobs keep their own screens; everything else uses the staged estimate.
      return workspace.jobType === "PDI" ? null : (
        <>
          {!workspace.readOnly && <ConsentCatchUp jobCardId={job.id} editable />}
          <EstimateStep job={job} bar={bar} readOnly={workspace.readOnly} />
        </>
      );
    case "DIAGNOSIS":
      // PDI jobs keep their own screens; everything else uses the staged diagnosis.
      return workspace.jobType === "PDI" ? null : <DiagnosisStep job={job} bar={bar} />;
    case "WARRANTY":
      // PDI jobs keep their own screens; everything else uses the staged warranty check.
      return workspace.jobType === "PDI" ? null : <WarrantyStep job={job} bar={bar} />;
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
          <WorkDoneSection job={job} />
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
