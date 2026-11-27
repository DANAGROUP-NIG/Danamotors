"use client";
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
import { BillingStep } from "../billing/BillingStep";
import { DeliveryStep } from "../delivery/DeliveryStep";

/**
 * What the current step shows: each of the 8 steps has its own staged screen (phases 2 to 9), and a closed
 * job shows the delivered summary. PDI jobs keep their own screens.
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
      // PDI jobs keep their own screens; everything else uses the staged billing (phase 8).
      return workspace.jobType === "PDI" ? null : <BillingStep job={job} workspace={workspace} bar={bar} />;
    case "DELIVERY":
      // PDI jobs keep their own screens; everything else uses the staged delivery (phase 9).
      return workspace.jobType === "PDI" ? null : <DeliveryStep job={job} workspace={workspace} bar={bar} onPrintGatePass={onPrintGatePass} />;
    case "CLOSED":
      // The delivered summary: who collected the vehicle, the gate pass, the follow-up call and the bill.
      return <DeliveryStep job={job} workspace={workspace} bar={bar} onPrintGatePass={onPrintGatePass} />;
    case "CANCELLED":
      return null;
  }
}

