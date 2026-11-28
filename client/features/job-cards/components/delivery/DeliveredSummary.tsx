"use client";
import Link from "next/link";
import { CalendarCheck, CheckCircle2, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { formatDateTime, NOT_PROVIDED } from "@/lib/format";
import { collectorTypeLabel, deliveredTitle, followUpLine } from "../../lib/delivery.logic";
import { gatePassPrintHref } from "../../lib/job-print.logic";
import { useJobBilling } from "../../hooks/use-job-billing";
import type { JobDeliveryStep } from "../../types/job-delivery.types";
import { InvoiceCard } from "../billing/BillingCards";
import { DetailList, StageCard } from "../workspace/StageCard";
import { DeclinedCard, WorkDoneCard } from "./DeliveryCards";

/** The delivered job, read only: who took it and when, the gate pass, the follow-up call, the work and the bill. */
export function DeliveredSummary({ jobId, step }: { jobId: string; step: JobDeliveryStep }) {
  const delivered = step.delivered!;
  const billing = useJobBilling(jobId);
  const collector = delivered.collector;
  return (
    <div className="space-y-4">
      <p role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-base font-semibold text-emerald-900">
        <CheckCircle2 className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
        {deliveredTitle(delivered)}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <StageCard
          title="Gate pass"
          actions={
            delivered.gatePassNumber ? (
              <Button variant="outline" asChild>
                <Link href={gatePassPrintHref(jobId, true)}>
                  <Printer aria-hidden="true" />
                  Print gate pass
                </Link>
              </Button>
            ) : undefined
          }
        >
          <p className="flex items-center gap-2 text-xl font-semibold tabular-nums">
            <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
            {delivered.gatePassNumber ?? NOT_PROVIDED}
          </p>
          <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <CalendarCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {followUpLine(delivered.psfFollowUpDueAt)}
          </p>
        </StageCard>
        <StageCard title="Handover">
          <DetailList
            rows={[
              { label: "Collected by", value: collector ? `${collector.name}${collector.phone ? `, ${collector.phone}` : ""}` : NOT_PROVIDED },
              { label: "Collector", value: collector ? collectorTypeLabel(collector.type) : NOT_PROVIDED },
              { label: "Customer signed", value: collector ? formatDateTime(collector.signedAt) : NOT_PROVIDED },
              { label: "Handed over by", value: delivered.by ?? NOT_PROVIDED },
              ...(delivered.lateReasons.length ? [{ label: "Reasons for late delivery", value: delivered.lateReasons.join(", ") }] : []),
              ...(delivered.lateRemarks ? [{ label: "Delay remark", value: delivered.lateRemarks }] : []),
              {
                label: "Belongings returned",
                value: delivered.belongingsReturned.length ? delivered.belongingsReturned.map((item) => item.label).join(", ") : "None recorded",
              },
            ]}
          />
        </StageCard>
        <WorkDoneCard lines={step.workDone} />
        <DeclinedCard items={step.declined} />
      </div>
      {billing.isLoading ? (
        <LoadingSkeleton label="Loading the job summary" />
      ) : billing.data ? (
        <InvoiceCard step={billing.data} readOnly />
      ) : (
        <p className="text-sm text-muted-foreground">The bill could not be loaded. Reload the page to see it.</p>
      )}
    </div>
  );
}
