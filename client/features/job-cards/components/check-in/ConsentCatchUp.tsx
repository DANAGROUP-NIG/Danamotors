"use client";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useJobOpeningConsent } from "../../hooks/use-job-opening-consent";
import { StageCard } from "../workspace/StageCard";
import { ConsentStep } from "./ConsentStep";

const NO_GATES = { details: [], walkAround: [], consent: [] };

/**
 * For a job past check-in whose customer consent is missing or out of date (jobs opened before
 * phase 2, or changed after signing). Shows the same consent step; nothing when it is signed.
 */
export function ConsentCatchUp({ jobCardId, editable }: { jobCardId: string; editable: boolean }) {
  const { hasPermission } = useAuth();
  const consent = useJobOpeningConsent(jobCardId, hasPermission("jobcard:read"));
  const state = consent.data?.state;
  if (!state || state === "signed" || state === "legacy") return null;
  return (
    <StageCard title="Customer consent needed" description="Work cannot start until the customer signs the job-opening consent.">
      <ConsentStep jobCardId={jobCardId} checkIn={{ gates: NO_GATES, consentState: state }} editable={editable} />
    </StageCard>
  );
}
