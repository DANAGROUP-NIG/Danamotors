"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CircleHelp, Gauge, ShieldCheck, XCircle } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import {
  COVERAGE_LABELS,
  COVERAGE_SOURCE_LABELS,
  COVERAGE_TONES,
  fmtDate,
  fmtDuration,
  fmtKm,
} from "../lib/warranty-format";
import type { WarrantyCheck } from "../types/warranty.types";
import { AlertBanner, DetailField, Meter, Pill, SectionCard } from "./ui";
import { VehicleWarrantyDialog } from "./VehicleWarrantyDialog";

function Summary({ check }: { check: WarrantyCheck }) {
  const c = check.coverage;
  if (c.status === "ACTIVE") {
    const parts = [c.remainingDays != null && fmtDuration(c.remainingDays), c.remainingKm != null && fmtKm(c.remainingKm)].filter(Boolean);
    return (
      <AlertBanner tone="emerald" icon={<CheckCircle2 />} title={`Under ${c.source === "MODEL" ? "manufacturer warranty" : COVERAGE_SOURCE_LABELS[c.source!].toLowerCase()}`}>
        {parts.length > 0 ? `${parts.join(" or ")} remaining${parts.length > 1 ? ", whichever comes first" : ""}.` : null}
      </AlertBanner>
    );
  }
  if (c.status === "UNKNOWN") {
    return (
      <AlertBanner tone="amber" icon={<CircleHelp />} title="Coverage could not be confirmed">
        {check.reasonText.join(". ")}. The vehicle is not treated as covered until this is fixed.
      </AlertBanner>
    );
  }
  if (c.status === "NOT_COVERED") {
    return <AlertBanner tone="gray" icon={<XCircle />} title="Not covered by manufacturer warranty">{check.reasonText.join(". ")}.</AlertBanner>;
  }
  return (
    <AlertBanner tone="red" icon={<AlertTriangle />} title={c.status === "EXPIRED_MILEAGE" ? "Warranty expired — km limit reached" : "Warranty expired"}>
      {check.reasonText.join(". ")}.
    </AlertBanner>
  );
}

/** Screen 01 — calculated coverage with time and distance meters. */
export function WarrantyCoverageCard({ check, isLoading }: { check?: WarrantyCheck; isLoading?: boolean }) {
  const { hasPermission, isSuperAdmin } = useAuth();
  const [editing, setEditing] = useState(false);
  const canEdit = isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.UPDATE) || hasPermission(WARRANTY_PERMISSIONS.SETTINGS);

  if (isLoading || !check) {
    return (
      <SectionCard icon={<ShieldCheck />} title="Warranty Coverage">
        <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
      </SectionCard>
    );
  }

  const c = check.coverage;
  const policy = check.policy;
  const policyText = policy
    ? `${policy.name ?? "Model"} — ${policy.warrantyDays ? `${Math.round(policy.warrantyDays / 365)} yrs` : "no date limit"} / ${policy.warrantyKm ? fmtKm(policy.warrantyKm) : "no km limit"}`
    : "No model policy";

  return (
    <SectionCard
      icon={<ShieldCheck />}
      title="Warranty Coverage"
      action={<Pill status={COVERAGE_LABELS[c.status]} tone={COVERAGE_TONES[c.status]} />}
    >
      <div className="space-y-5">
        <Summary check={check} />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CalendarDays className="size-4 text-slate-500" /> Time
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {c.startDate ? `Started ${fmtDate(c.startDate)}` : "No start date"}
              {c.expiresOn && ` · Expires ${fmtDate(c.expiresOn)}`}
            </p>
            {c.daysUsedPercent != null ? (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <Meter percent={c.daysUsedPercent} />
                  <span className="w-10 text-right text-xs font-semibold text-slate-600">{c.daysUsedPercent}%</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">{c.remainingDays?.toLocaleString("en-NG")} days left</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-400">—</p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Gauge className="size-4 text-slate-500" /> Distance
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {c.mileage != null ? fmtKm(c.mileage) : "No reading"}
              {c.kmLimit != null && ` of ${fmtKm(c.kmLimit)}`}
            </p>
            {c.kmUsedPercent != null ? (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <Meter percent={c.kmUsedPercent} />
                  <span className="w-10 text-right text-xs font-semibold text-slate-600">{c.kmUsedPercent}%</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">{fmtKm(c.remainingKm)} left</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-400">—</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 border-b border-slate-100 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField label="Warranty start" value={fmtDate(c.startDate)} />
          <DetailField label="Policy" value={policyText} />
          <DetailField
            label="Last recorded mileage"
            value={
              <>
                {fmtKm(check.vehicle.lastRecordedMileage)}
                {check.vehicle.lastMileageAt && (
                  <span className="block text-xs text-slate-400">recorded {fmtDate(check.vehicle.lastMileageAt)}</span>
                )}
              </>
            }
          />
          <DetailField
            label="Source"
            value={
              <>
                {c.source ? COVERAGE_SOURCE_LABELS[c.source] : "—"}
                {check.override?.reason && <span className="block text-xs text-slate-400">{check.override.reason}</span>}
              </>
            }
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">Coverage is calculated from the model policy, start date and latest odometer.</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
            >
              Edit warranty details / extended warranty / goodwill <ArrowRight className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {editing && <VehicleWarrantyDialog check={check} onClose={() => setEditing(false)} />}
    </SectionCard>
  );
}
