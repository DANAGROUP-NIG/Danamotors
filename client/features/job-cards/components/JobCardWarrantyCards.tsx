"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Clock, Info, Loader2, Megaphone, ShieldCheck, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { jobCardKeys } from "../api/job-card.keys";
import { jobCardLineKeys } from "../hooks/use-job-card-lines";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { CAMPAIGN_PERMISSIONS, WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { NOT_ATTENDED_REASONS, type NotAttendedReason } from "../api/job-card-campaigns.api";
import { useSetCampaignAttendance } from "../hooks/use-job-card-campaigns";
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
  fmtDateTime,
  fmtKm,
  personName,
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

type LinkedCampaign = NonNullable<JobCard["campaigns"]>[number];

/** "Was the campaign work done?" for one linked campaign. READY needs an answer for each. */
function CampaignAttendance({ jobCardId, campaign, canEdit }: { jobCardId: string; campaign: LinkedCampaign; canEdit: boolean }) {
  const save = useSetCampaignAttendance(jobCardId);
  const [notDone, setNotDone] = useState(false);
  const [reason, setReason] = useState<NotAttendedReason | "">("");
  const [note, setNote] = useState("");
  const answered = campaign.attended !== null;
  const editing = notDone && canEdit;
  const pending = save.isPending;

  const done = () => save.mutate({ campaignId: campaign.campaignId, body: { attended: true } }, { onSuccess: () => setNotDone(false) });
  const notDoneSave = () =>
    reason &&
    save.mutate(
      { campaignId: campaign.campaignId, body: { attended: false, reason, note: note.trim() || null } },
      { onSuccess: () => { setNotDone(false); setNote(""); } },
    );

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">Campaign work done on this job?</p>
        <div role="group" aria-label={`Campaign work done for ${campaign.campaignCode}`} className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
          <button
            type="button"
            disabled={!canEdit || pending}
            aria-pressed={campaign.attended === true && !notDone}
            onClick={done}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
              campaign.attended === true && !notDone ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-slate-50 disabled:text-slate-400",
            )}
          >
            {pending && !notDone ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Done
          </button>
          <button
            type="button"
            disabled={!canEdit || pending}
            aria-pressed={campaign.attended === false || notDone}
            onClick={() => setNotDone(true)}
            className={cn(
              "inline-flex items-center gap-1.5 border-l border-slate-300 px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
              campaign.attended === false || notDone ? "bg-amber-500 text-white" : "text-slate-700 hover:bg-slate-50 disabled:text-slate-400",
            )}
          >
            <X className="size-3.5" /> Not done
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Reason
            <select className={cn(inputCls, "h-9")} value={reason} onChange={(e) => setReason(e.target.value as NotAttendedReason | "")} autoFocus>
              <option value="">Choose a reason…</option>
              {(Object.keys(NOT_ATTENDED_REASONS) as NotAttendedReason[]).map((key) => (
                <option key={key} value={key}>{NOT_ATTENDED_REASONS[key]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            {reason === "OTHER" ? "Describe the reason" : "Note (optional)"}
            <input className={cn(inputCls, "h-9")} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={reason === "PARTS_NOT_AVAILABLE" ? "e.g. part on back order" : ""} />
          </label>
          <div className="flex items-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setNotDone(false)}>Cancel</Button>
            <Button type="button" size="sm" disabled={!reason || (reason === "OTHER" && !note.trim()) || pending} onClick={notDoneSave}>
              {pending && <Loader2 className="size-3.5 animate-spin" />} Save
            </Button>
          </div>
        </div>
      ) : (
        <p className={cn("mt-2 flex items-start gap-1.5 text-xs", answered ? "text-slate-500" : campaign.hasFreeLine ? "text-blue-700" : "text-amber-700")}>
          {answered ? <Check className="mt-px size-3.5 shrink-0" /> : campaign.hasFreeLine ? <Info className="mt-px size-3.5 shrink-0" /> : <Clock className="mt-px size-3.5 shrink-0" />}
          {answered
            ? `${campaign.attended ? "Done" : `Not done: ${campaign.notAttendedReason ?? "no reason"}`} · recorded by ${personName(campaign.attendedBy)} on ${fmtDateTime(campaign.attendedAt)}`
            : campaign.hasFreeLine
              ? "Pre-set to done: a free line is charged to this campaign. Change it if the work was not done."
              : "Answer before the job is marked ready. Not done returns the vehicle to the outstanding list."}
        </p>
      )}
    </div>
  );
}

/**
 * Screen 04 — campaigns the job card was opened for, with this vehicle's progress and the
 * "work done" answer. Shown to every job card user: the answer needs jobcard:update, not warranty:read.
 */
export function LinkedCampaignsCard({ jobCard, canEdit }: { jobCard: JobCard; canEdit: boolean }) {
  const campaigns = jobCard.campaigns ?? [];
  const { hasPermission, isSuperAdmin } = useAuth();
  const canOpenCampaign = isSuperAdmin || hasPermission(CAMPAIGN_PERMISSIONS.READ);
  const open = campaigns.filter((c) => c.attended === null && !c.hasFreeLine).length;
  return (
    <SectionCard
      icon={<Megaphone />}
      title="Linked campaigns"
      note={open > 0 ? `${open} to answer before ready` : undefined}
      className="h-full print:hidden"
    >
      {campaigns.length === 0 ? (
        <p className="text-sm text-slate-400">No recall, FPC or campaign work on this job card.</p>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <li key={c.campaignId} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {canOpenCampaign ? (
                  <Link href={`/campaigns/${c.campaignId}`} className="font-mono text-xs font-semibold text-slate-800 hover:underline">
                    {c.campaignCode}
                  </Link>
                ) : (
                  <span className="font-mono text-xs font-semibold text-slate-800">{c.campaignCode}</span>
                )}
                <span className="min-w-0 flex-1 text-slate-600">
                  {CAMPAIGN_TYPE_LABELS[c.campaignType]} — {c.campaignTitle}
                </span>
                {c.vehicleStatus && <Pill status={CAMPAIGN_VEHICLE_LABELS[c.vehicleStatus]} tone={CAMPAIGN_VEHICLE_TONES[c.vehicleStatus]} />}
              </div>
              <CampaignAttendance jobCardId={jobCard.id} campaign={c} canEdit={canEdit} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Print only: the job card text of each linked campaign marked "print on job card". */
export function CampaignPrintBox({ jobCard }: { jobCard: JobCard }) {
  const printed = (jobCard.campaigns ?? []).filter((c) => c.campaign.printOnJobCard);
  if (printed.length === 0) return null;
  return (
    <section className="hidden break-inside-avoid border-2 border-black p-2 text-black print:block" aria-label="FPC / campaign">
      <p className="text-[9pt] font-bold uppercase tracking-widest">FPC / campaign</p>
      <ul className="mt-1 space-y-0.5 font-mono text-[10pt]">
        {printed.map((c) => (
          <li key={c.campaignId} className="flex gap-3">
            <span className="w-[16ch] shrink-0 font-semibold">{c.campaignCode}</span>
            <span className="min-w-0 flex-1">{c.campaign.jobCardText || c.campaignTitle}</span>
            <span className="shrink-0">Done: ____</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
