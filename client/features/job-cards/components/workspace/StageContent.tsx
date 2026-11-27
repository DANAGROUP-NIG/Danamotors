"use client";
import Link from "next/link";
import { Printer, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { formatDateTime } from "@/lib/format";
import { canonicalJobStatus } from "../../types/job-card-status";
import type { JobCard } from "../../types/job-card.types";
import type { JobWorkspace } from "../../types/job-workspace.types";
import type { JobFileTab } from "../../lib/job-frame.logic";
import { CheckInStep, type StageBarProps } from "../check-in/CheckInStep";
import { ConsentCatchUp } from "../check-in/ConsentCatchUp";
import { DiagnosisStep } from "../diagnosis/DiagnosisStep";
import { WarrantyStep } from "../warranty/WarrantyStep";
import { EstimateStep } from "../estimate/EstimateStep";
import { RepairStep } from "../repair/RepairStep";
import { QualityCheckStep } from "../quality-check/QualityCheckStep";
import { InvoicesTable } from "./InvoicesTable";
import { StageCard } from "./StageCard";
import { CreditApprovalSection, DeliverySection } from "./WorkshopSections";

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
      // PDI jobs keep their own screens; everything else uses the staged repair (phase 6).
      return workspace.jobType === "PDI" ? null : <RepairStep job={job} workspace={workspace} bar={bar} onOpenTab={onOpenTab} />;
    case "QUALITY_CHECK":
      // PDI jobs keep their own screens; everything else uses the staged quality check (phase 7).
      return workspace.jobType === "PDI" ? null : <QualityCheckStep job={job} workspace={workspace} bar={bar} />;
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
