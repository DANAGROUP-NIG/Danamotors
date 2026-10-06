"use client";

import Link from "next/link";
import { ArrowRight, Megaphone, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { jobCardKeys } from "../api/job-card.keys";
import { jobCardLineKeys } from "../hooks/use-job-card-lines";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { useOpenWarrantyCase } from "@/features/warranty/hooks/use-warranty";
import { Pill, SectionCard } from "@/features/warranty/components/ui";
import {
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_VEHICLE_LABELS,
  CAMPAIGN_VEHICLE_TONES,
  CASE_STATUS_LABELS,
  CASE_STATUS_TONES,
  COVERAGE_LABELS,
  COVERAGE_TONES,
  fmtDate,
  fmtKm,
} from "@/features/warranty/lib/warranty-format";
import type { JobCard } from "../types/job-card.types";

/** Screen 04 — coverage snapshotted when the job card was created, and its warranty case. */
export function WarrantySnapshotCard({ jobCard }: { jobCard: JobCard }) {
  const { hasPermission, isSuperAdmin } = useAuth();
  const canOpen = isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.CLAIM);
  const open = useOpenWarrantyCase();
  const qc = useQueryClient();
  const status = jobCard.warrantyStatusAtCreation;
  const snapshot = jobCard.warrantySnapshot;
  const coverage = snapshot?.coverage;

  return (
    <SectionCard
      icon={<ShieldCheck />}
      title="Warranty at creation"
      action={status ? <Pill status={COVERAGE_LABELS[status]} tone={COVERAGE_TONES[status]} /> : undefined}
      className="h-full"
    >
      {!status ? (
        <p className="text-sm text-slate-400">This job card was opened before warranty checks, or without a vehicle.</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-base text-slate-800">
            {status === "ACTIVE"
              ? [jobCard.warrantyExpiresOnAtCreation && `Expires ${fmtDate(jobCard.warrantyExpiresOnAtCreation.slice(0, 10))}`, coverage?.remainingKm != null && `${fmtKm(coverage.remainingKm)} remaining`]
                  .filter(Boolean)
                  .join(" · ")
              : (snapshot?.reasonText ?? []).join(". ") || COVERAGE_LABELS[status]}
          </p>
          <p className="text-xs text-slate-400">Snapshot taken when the job card was created — later changes do not alter it.</p>
          {snapshot?.odometerReplaced && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Odometer replaced (previous reading {fmtKm(snapshot.previousMileage)}): {snapshot.odometerReplacedReason}
            </p>
          )}
          {jobCard.warrantyAcknowledgedBy && (
            <p className="text-xs text-slate-500">
              Acknowledged by {jobCard.warrantyAcknowledgedBy.firstName} {jobCard.warrantyAcknowledgedBy.lastName}
            </p>
          )}
          {jobCard.warrantyCase ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/warranty/${jobCard.warrantyCase.id}`} className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline">
                Warranty case {jobCard.warrantyCase.caseNumber} <ArrowRight className="size-4" />
              </Link>
              <Pill status={CASE_STATUS_LABELS[jobCard.warrantyCase.status]} tone={CASE_STATUS_TONES[jobCard.warrantyCase.status]} />
            </div>
          ) : (
            canOpen &&
            jobCard.vehicleId && (
              <Button size="sm" variant="outline" disabled={open.isPending} onClick={() =>
                  open.mutate(
                    { jobCardId: jobCard.id },
                    {
                      onSuccess: () => {
                        qc.invalidateQueries({ queryKey: jobCardKeys.detail(jobCard.id) });
                        qc.invalidateQueries({ queryKey: jobCardLineKeys.lines(jobCard.id) });
                      },
                    },
                  )
                }>
                Open warranty case
              </Button>
            )
          )}
        </div>
      )}
    </SectionCard>
  );
}

/** Screen 04 — campaigns the job card was opened for, with this vehicle's progress. */
export function LinkedCampaignsCard({ jobCard }: { jobCard: JobCard }) {
  const campaigns = jobCard.campaigns ?? [];
  return (
    <SectionCard icon={<Megaphone />} title="Linked campaigns" className="h-full">
      {campaigns.length === 0 ? (
        <p className="text-sm text-slate-400">No recall or campaign work on this job card.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {campaigns.map((c) => (
            <li key={c.campaignId} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <Link href={`/campaigns/${c.campaignId}`} className="font-mono text-xs font-semibold text-slate-800 hover:underline">
                {c.campaignCode}
              </Link>
              <span className="min-w-0 flex-1 text-slate-600">
                {CAMPAIGN_TYPE_LABELS[c.campaignType]} — {c.campaignTitle}
              </span>
              {c.vehicleStatus && <Pill status={CAMPAIGN_VEHICLE_LABELS[c.vehicleStatus]} tone={CAMPAIGN_VEHICLE_TONES[c.vehicleStatus]} />}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
