"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleAlert, Download, ExternalLink, Loader2 } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Pill } from "@/features/warranty/components/ui";
import {
  CAMPAIGN_TYPE_HINTS,
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_TYPE_TONES,
  CAMPAIGN_VEHICLE_LABELS,
  fmtDate,
  fmtFileSize,
} from "@/features/warranty/lib/warranty-format";
import { useDownloadCampaignDocument, useOpenCampaignsForVehicle } from "../hooks/use-campaigns";
import type { OpenCampaignWithManuals } from "../types/campaign.types";

export type CampaignAlertContext = "jobcard" | "vehicle" | "checkin";

const NEXT_STEP: Record<CampaignAlertContext, string> = {
  jobcard: "Include the work in this job card and tell the customer.",
  vehicle: "Tell the customer and book the work.",
  checkin: "Tell the customer before checking the vehicle in.",
};

/**
 * Whether the affected-VIN pop-up should show for a vehicle. It shows once per vehicle
 * until dismissed, and only when the vehicle has open campaigns.
 */
export function useCampaignAlert(vehicleId: string | null | undefined) {
  const { data } = useOpenCampaignsForVehicle(vehicleId);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const campaigns = data?.campaigns ?? [];
  return {
    open: Boolean(vehicleId) && campaigns.length > 0 && dismissed !== vehicleId,
    vin: data?.vin ?? "",
    campaigns,
    dismiss: () => setDismissed(vehicleId ?? null),
  };
}

/**
 * The affected-VIN pop-up: a recall, field fix or bulletin tied to the VIN, what to do,
 * and the manuals to download. `onCancel` adds a secondary action, such as cancelling a check-in.
 */
export function CampaignAlertModal({
  vin,
  campaigns,
  context,
  onContinue,
  onCancel,
  continueLabel = "I have noted the campaign work",
  cancelLabel,
}: {
  vin: string;
  campaigns: OpenCampaignWithManuals[];
  context: CampaignAlertContext;
  onContinue: () => void;
  onCancel?: () => void;
  continueLabel?: string;
  cancelLabel?: string;
}) {
  const download = useDownloadCampaignDocument();
  const recall = campaigns.some((c) => c.type === "RECALL");

  return (
    <ModalFame
      isOpen
      onClose={onContinue}
      size="wide"
      title={campaigns.length === 1 ? "This vehicle has an open campaign" : `This vehicle has ${campaigns.length} open campaigns`}
      description={`VIN ${vin} is on the affected list. ${NEXT_STEP[context]}`}
    >
      <div className="grid gap-4" role="alert">
        {recall && (
          <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            This vehicle is under an open recall. The work must be done before the vehicle is released.
          </p>
        )}
        <ul className="grid gap-3">
          {campaigns.map((c) => (
            <li key={c.campaignId} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Pill status={CAMPAIGN_TYPE_LABELS[c.type]} tone={CAMPAIGN_TYPE_TONES[c.type]} />
                <span className="font-mono text-sm text-slate-600">{c.code}</span>
                <span className="text-xs text-slate-500">Status: {CAMPAIGN_VEHICLE_LABELS[c.vehicleStatus]}</span>
              </div>
              <p className="mt-2 font-semibold text-slate-900">{c.title}</p>
              {c.defectDescription && <p className="mt-1 text-sm text-slate-600">{c.defectDescription}</p>}
              <p className="mt-2 text-sm text-slate-700">{CAMPAIGN_TYPE_HINTS[c.type]}</p>
              <p className="mt-1 text-xs text-slate-500">
                Runs from {fmtDate(c.startDate)}
                {c.endDate ? ` to ${fmtDate(c.endDate)}` : ", no end date"}
                {c.scheduledAt && `. Booked for ${fmtDate(c.scheduledAt)}`}.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {c.documents.map((doc) => {
                  const busy = download.isPending && download.variables?.id === doc.id;
                  return (
                    <Button
                      key={doc.id}
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={busy}
                      onClick={() => download.mutate({ campaignId: c.campaignId, id: doc.id, fileName: doc.fileName })}
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
                      {doc.title} ({fmtFileSize(doc.sizeBytes)})
                    </Button>
                  );
                })}
                <Button size="sm" variant="ghost" className="gap-1.5" asChild>
                  <Link href={`/campaigns/${c.campaignId}`} target="_blank" rel="noopener">
                    <ExternalLink className="size-4" aria-hidden="true" /> View campaign
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              {cancelLabel ?? "Cancel"}
            </Button>
          )}
          <Button onClick={onContinue}>{continueLabel}</Button>
        </div>
      </div>
    </ModalFame>
  );
}

/**
 * Pops up once when a vehicle with open campaigns is picked or opened, so the adviser
 * cannot miss a recall, field fix or bulletin tied to the VIN. Renders nothing otherwise.
 */
export function CampaignAlertDialog({ vehicleId, context = "vehicle" }: { vehicleId: string | null | undefined; context?: CampaignAlertContext }) {
  const alert = useCampaignAlert(vehicleId);
  if (!alert.open) return null;
  return <CampaignAlertModal vin={alert.vin} campaigns={alert.campaigns} context={context} onContinue={alert.dismiss} />;
}
