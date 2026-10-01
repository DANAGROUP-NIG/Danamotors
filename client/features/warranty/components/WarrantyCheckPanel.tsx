"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleAlert, CircleHelp, Info, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COVERAGE_SOURCE_LABELS, fmtDate, fmtKm } from "../lib/warranty-format";
import type { OpenCampaign, WarrantyCheck } from "../types/warranty.types";
import { AlertBanner, type BannerTone } from "./ui";

/** The coverage banner: under warranty, expired, not covered or unknown. */
export function CoverageBanner({ check, variant = "jobcard" }: { check: WarrantyCheck; variant?: "jobcard" | "checkin" }) {
  const c = check.coverage;
  if (c.status === "ACTIVE") {
    const left = [c.expiresOn && `Expires ${fmtDate(c.expiresOn)}`, c.remainingKm != null && `${fmtKm(c.remainingKm)} remaining`].filter(Boolean).join(" · ");
    return (
      <AlertBanner
        tone="emerald"
        icon={<CheckCircle2 />}
        title={c.source && c.source !== "MODEL" ? `Covered — ${COVERAGE_SOURCE_LABELS[c.source].toLowerCase()}` : "Vehicle is under warranty"}
      >
        {left && <p>{left}.</p>}
        {variant === "jobcard" && <p>The warranty officer will be notified and a warranty case opened.</p>}
      </AlertBanner>
    );
  }
  if (c.status === "EXPIRED_MILEAGE" || c.status === "EXPIRED_DATE") {
    const km = c.status === "EXPIRED_MILEAGE";
    return (
      <AlertBanner tone="amber" icon={<AlertTriangle />} title={km ? "Warranty expired — mileage limit reached" : "Warranty expired — period has ended"}>
        {km ? (
          <p>
            {fmtKm(c.mileage)} exceeds the {fmtKm(c.kmLimit)} limit
            {c.expiresOn && !check.coverage.reasons.includes("DATE_LIMIT_PASSED") ? ` (date limit would run to ${fmtDate(c.expiresOn)})` : ""}.
          </p>
        ) : (
          <p>The warranty ended on {fmtDate(c.expiresOn)}.</p>
        )}
        <p>Work will be charged to the customer unless goodwill is approved.</p>
      </AlertBanner>
    );
  }
  if (c.status === "NOT_COVERED") {
    return (
      <AlertBanner tone="gray" icon={<XCircle />} title="Not covered by manufacturer warranty">
        {check.reasonText.join(". ")}.
      </AlertBanner>
    );
  }
  return (
    <AlertBanner tone="amber" icon={<CircleHelp />} title="Warranty could not be confirmed">
      <p>{check.reasonText.join(". ")}.</p>
      <p>Treated as not covered. A warranty officer can verify it and open a case.</p>
    </AlertBanner>
  );
}

const CAMPAIGN_BANNER: Record<OpenCampaign["type"], { tone: BannerTone; label: string; icon: ReactNode; hint: string }> = {
  RECALL: { tone: "red", label: "Open recall", icon: <CircleAlert />, hint: "include this work in the job." },
  FREE_FIX: { tone: "blue", label: "Free fix", icon: <Info />, hint: "no charge to customer." },
  SERVICE_CAMPAIGN: { tone: "blue", label: "Service campaign", icon: <Info />, hint: "offer this service to the customer." },
};

export function CampaignBanner({ campaign, compact }: { campaign: OpenCampaign; compact?: boolean }) {
  const meta = CAMPAIGN_BANNER[campaign.type];
  return (
    <AlertBanner
      tone={meta.tone}
      icon={meta.icon}
      title={compact ? `${meta.label}: ${campaign.code} — ${campaign.title}` : `${meta.label}: ${campaign.code}`}
      action={
        compact ? (
          <Button asChild size="sm" variant="outline" className="bg-white">
            <Link href={`/campaigns/${campaign.campaignId}`} target="_blank">
              View campaign
            </Link>
          </Button>
        ) : undefined
      }
    >
      {!compact && (
        <p>
          {campaign.title} — {meta.hint}
        </p>
      )}
    </AlertBanner>
  );
}

/**
 * The warranty & campaign check shown before a job card is created (screen 02) and at
 * check-in (screen 03): coverage banner, one banner per open campaign, and the adviser's
 * acknowledgement when the vehicle is covered or has open campaigns.
 */
export function WarrantyCheckPanel({
  check,
  isFetching,
  isError,
  acknowledged,
  onAcknowledgedChange,
  acknowledgedBy,
  variant = "jobcard",
  emptyText = "Select a vehicle and enter the current mileage to run the check.",
}: {
  check?: WarrantyCheck;
  isFetching?: boolean;
  isError?: boolean;
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
  acknowledgedBy?: string;
  variant?: "jobcard" | "checkin";
  emptyText?: string;
}) {
  if (isError) return <p className="text-sm text-red-600">The warranty check failed. Check the mileage and try again.</p>;
  if (!check) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">
        {isFetching ? <Loader2 className="size-4 animate-spin" /> : null}
        {isFetching ? "Checking warranty and campaigns…" : emptyText}
      </div>
    );
  }

  const campaigns = check.openCampaigns;
  const ackText =
    variant === "jobcard"
      ? `I have informed the customer about the warranty coverage${campaigns.length ? " and the open campaigns listed above" : ""}.`
      : `Customer informed about the warranty status${campaigns.length ? ` and open ${campaigns.length > 1 ? "campaigns" : campaigns[0].type === "RECALL" ? "recall" : "campaign"}` : ""}.`;

  return (
    <div className={cn("space-y-3 transition-opacity", isFetching && "opacity-60")}>
      {check.mileageWarning && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Mileage is {check.mileageWarning.toLowerCase()}.</p>
      )}
      <CoverageBanner check={check} variant={variant} />
      {campaigns.map((c) => (
        <CampaignBanner key={c.campaignId} campaign={c} compact={variant === "checkin"} />
      ))}
      {check.requiresAcknowledgement && (
        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 text-sm",
            acknowledged ? "border-slate-300" : "border-amber-300 ring-2 ring-amber-100",
          )}
        >
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[#05141F]"
            checked={acknowledged}
            onChange={(e) => onAcknowledgedChange(e.target.checked)}
          />
          <span>
            <span className="text-slate-800">{ackText}</span>
            {acknowledged && acknowledgedBy && <span className="mt-1 block text-xs text-slate-400">Acknowledged by {acknowledgedBy}</span>}
            {!acknowledged && <span className="mt-1 block text-xs text-amber-700">Required before continuing.</span>}
          </span>
        </label>
      )}
    </div>
  );
}

/** Reads the 409 WARRANTY_ACK_REQUIRED payload from an axios error, if that is what it is. */
export function ackRequiredCheck(error: unknown): WarrantyCheck | null {
  const data = (error as { response?: { status?: number; data?: { code?: string; details?: WarrantyCheck } } })?.response;
  return data?.status === 409 && data.data?.code === "WARRANTY_ACK_REQUIRED" ? (data.data.details ?? null) : null;
}
