"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import {
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_TYPE_TONES,
  CAMPAIGN_VEHICLE_LABELS,
  CAMPAIGN_VEHICLE_TONES,
  fmtDate,
} from "../lib/warranty-format";
import type { OpenCampaign } from "../types/warranty.types";
import { Pill, SectionCard } from "./ui";

/** Screen 01 — campaigns still open for this vehicle. */
export function OpenCampaignsCard({ campaigns, isLoading }: { campaigns?: OpenCampaign[]; isLoading?: boolean }) {
  return (
    <SectionCard icon={<Megaphone />} title="Open Campaigns" className="h-full">
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
      ) : !campaigns?.length ? (
        <p className="text-sm text-slate-400">No open recalls or free fixes for this vehicle.</p>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <li key={c.campaignId}>
              <Link href={`/campaigns/${c.campaignId}`} className="block rounded-xl border border-slate-200 p-4 transition-colors hover:bg-slate-50">
                <div className="flex flex-wrap items-center gap-3">
                  <Pill status={CAMPAIGN_TYPE_LABELS[c.type]} tone={CAMPAIGN_TYPE_TONES[c.type]} />
                  <span className="font-mono text-xs text-slate-500">{c.code}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800">{c.title}</p>
                <p className="mt-0.5 text-xs text-slate-400">Active since {fmtDate(c.startDate)}</p>
                <div className="mt-2">
                  <Pill
                    status={
                      c.vehicleStatus === "PENDING"
                        ? "Not yet contacted"
                        : c.vehicleStatus === "SCHEDULED" && c.scheduledAt
                          ? `Scheduled ${fmtDate(c.scheduledAt)}`
                          : CAMPAIGN_VEHICLE_LABELS[c.vehicleStatus]
                    }
                    tone={c.vehicleStatus === "PENDING" ? "amber" : CAMPAIGN_VEHICLE_TONES[c.vehicleStatus]}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
