"use client";
import Link from "next/link";
import { Printer } from "lucide-react";
import { CustomerExplanation } from "@/components/CustomerExplanation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { customerCategoryLabel } from "@/features/customers/lib/customer-category";
import { JobCardLatePanel } from "@/features/late-deliveries/components/JobCardLatePanel";
import { JobCardRepeatPanel } from "@/features/repeat-jobs/components/JobCardRepeatPanel";
import { NOT_PROVIDED, formatDate, formatDateTime, formatKm, formatMoney } from "@/lib/format";
import { useJobOpeningConsent } from "../../hooks/use-job-opening-consent";
import {
  activityLine,
  activityOwner,
  customerName,
  jobStatusWords,
  vehicleTitle,
  yesNo,
} from "../../lib/job-frame.logic";
import { STAGE_LABELS } from "../../lib/job-stage.logic";
import { canonicalJobStatus } from "../../types/job-card-status";
import type { JobCard } from "../../types/job-card.types";
import type { PreviousVisit, StageActivity } from "../../types/job-workspace.types";
import { JobCardLinesCard } from "../JobCardLinesCard";
import { LinkedCampaignsCard, WarrantySnapshotCard } from "../JobCardWarrantyCards";
import { toEstimateViewModel } from "../repair-workspace-helpers";
import { WORKSPACE_COPY } from "../repair-workspace-copy";
import { InvoicesTable } from "./InvoicesTable";
import { DetailList, StageCard } from "./StageCard";

const person = (value: { firstName: string; lastName: string } | null | undefined) =>
  value ? `${value.firstName} ${value.lastName}`.trim() || NOT_PROVIDED : NOT_PROVIDED;
const text = (value: string | null | undefined) => value?.trim() || NOT_PROVIDED;
const linkCls = "font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CustomerVehicleTab({ job }: { job: JobCard }) {
  const tyres = (job.tyres ?? []).filter((tyre) => tyre.make || tyre.number);
  const opening = (
    [
      ["Opening estimate, parts", job.estimatedParts],
      ["Opening estimate, oil", job.estimatedOil],
      ["Opening estimate, labour", job.estimatedLabour],
      ["Service charge", job.serviceCharge],
    ] as const
  ).filter(([, amount]) => amount !== undefined);
  return (
    <>
      <StageCard
        title="Customer"
        actions={
          job.customer ? (
            <Link href={`/customers/${job.customer.id}`} className={linkCls}>
              View full profile
            </Link>
          ) : undefined
        }
      >
        <DetailList
          rows={[
            { label: "Name", value: customerName(job.customer) },
            { label: "Category", value: customerCategoryLabel(job.customer) },
            { label: "Mobile", value: text(job.customer?.phoneNumber) },
            { label: "Email", value: text(job.customer?.email) },
          ]}
        />
      </StageCard>
      <StageCard title="Vehicle">
        <DetailList
          rows={[
            { label: "Plate", value: text(job.vehicle?.registrationNumber) },
            { label: "Vehicle", value: vehicleTitle(job.vehicle) },
            { label: "VIN", value: text(job.vehicle?.vin) },
            { label: "Variant", value: text(job.vehicle?.trim) },
          ]}
        />
      </StageCard>
      <StageCard title="This visit">
        <DetailList
          rows={[
            { label: "Branch", value: text(job.branch?.name) },
            { label: "Opened", value: formatDateTime(job.createdAt) },
            { label: "Opened by", value: person(job.createdBy) },
            { label: "Service advisor", value: person(job.serviceAdvisor) },
            { label: "Service type", value: text(job.serviceType?.description ?? job.service?.name) },
            { label: "Mileage", value: formatKm(job.mileage) },
            { label: "Bay", value: text(job.bay?.description) },
            { label: "Booking", value: job.appointment ? formatDateTime(job.appointment.scheduledAt) : NOT_PROVIDED },
            { label: "Technician", value: job.technician ? person(job.technician) : "Not assigned" },
            { label: "Quality inspector", value: job.qualityInspector ? person(job.qualityInspector) : "Not assigned" },
            { label: "Delivered by", value: job.deliveryAdvisor ? person(job.deliveryAdvisor) : "Not delivered yet" },
            { label: "A/C fitted", value: yesNo(job.acFitted) },
            { label: "In-house vehicle", value: yesNo(job.inHouse) },
            ...opening.map(([label, amount]) => ({ label, value: formatMoney(amount) })),
            ...tyres.map((tyre, index) => ({ label: `Tyre ${index + 1}`, value: `${text(tyre.make)}, ${text(tyre.number)}` })),
            ...(job.batteryMake || job.batteryNumber ? [{ label: "Battery", value: `${text(job.batteryMake)}, ${text(job.batteryNumber)}` }] : []),
            ...(job.customField1 ? [{ label: "Custom field", value: job.customField1 }] : []),
            { label: "Instructions to technician", value: text(job.checkIn?.instructionsToTechnician) },
            { label: "Checklist notes", value: text(job.checkIn?.checklistNote) },
            { label: "Internal remarks", value: text(job.remarks) },
          ]}
        />
      </StageCard>
    </>
  );
}

export function VisitHistoryTab({ job, visits }: { job: JobCard; visits: PreviousVisit[] }) {
  return (
    <>
      <StageCard title="Last two visits" description="Earlier visits of this vehicle at any branch, newest first.">
        {visits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No earlier visits are recorded for this vehicle.</p>
        ) : (
          <ul className="space-y-3">
            {visits.map((visit) => (
              <li key={visit.id} className="space-y-2 rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/job-cards/${visit.id}`} className={linkCls}>
                    Job {visit.jobNumber}
                  </Link>
                  <span className="text-muted-foreground">{STAGE_LABELS[visit.stage]}</span>
                </div>
                <DetailList
                  rows={[
                    { label: "Opened", value: formatDate(visit.openedAt) },
                    { label: "Delivered", value: visit.deliveredAt ? formatDate(visit.deliveredAt) : NOT_PROVIDED },
                    { label: "Mileage", value: formatKm(visit.mileage) },
                    { label: "Branch", value: visit.branchName },
                    { label: "Service", value: text(visit.service) },
                    { label: "Customer requests", value: visit.requests.length ? visit.requests.join("; ") : NOT_PROVIDED },
                    { label: "Work done", value: text(visit.workDone) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </StageCard>
      <JobCardRepeatPanel jobCardId={job.id} enabled={Boolean(job.repeatRecord || job.isRepeat)} />
    </>
  );
}

export function WarrantyTab({ job }: { job: JobCard }) {
  const { hasPermission, isSuperAdmin } = useAuth();
  const canSeeWarranty = isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.READ);
  const open = !["DELIVERED", "CANCELLED"].includes(canonicalJobStatus(job.status));
  return (
    <>
      {canSeeWarranty ? (
        <WarrantySnapshotCard jobCard={job} />
      ) : (
        <StageCard title="Warranty at creation">
          <p className="text-sm text-muted-foreground">Warranty details are shown to staff with warranty access, such as the warranty officer.</p>
        </StageCard>
      )}
      <LinkedCampaignsCard jobCard={job} canEdit={hasPermission("jobcard:update") && open} />
      <JobCardLinesCard jobCardId={job.id} />
    </>
  );
}

export function DocumentsTab({ job, onPrintGatePass }: { job: JobCard; onPrintGatePass: () => void }) {
  const { hasPermission } = useAuth();
  const canPrintEstimate = hasPermission("estimate:print");
  const consent = useJobOpeningConsent(job.id, hasPermission("jobcard:read"));
  const signature = consent.data?.signature;
  const invoices = job.invoices ?? [];
  return (
    <>
      <StageCard title="Job-opening approval">
        {consent.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Loading the approval</p>
        ) : consent.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load the approval.{" "}
            <button type="button" className="underline" onClick={() => consent.refetch()}>
              Try again
            </button>
          </p>
        ) : signature ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>
              Signed by {signature.signerName}, {formatDateTime(signature.signedAt)}, revision {signature.revision}
            </p>
            {canPrintEstimate && consent.data?.state !== "invalid" && (
              <Link href={`/job-cards/${job.id}/opening-consent/${signature.id}/print`} className={linkCls}>
                Print signed approval
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">The customer has not signed the job-opening approval yet.</p>
        )}
      </StageCard>
      <StageCard title="Estimates">
        {!job.estimates?.length ? (
          <p className="text-sm text-muted-foreground">No estimate has been prepared yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {job.estimates.map((estimate) => {
              const view = toEstimateViewModel(estimate);
              return (
                <li key={estimate.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    Revision {view.version}, {WORKSPACE_COPY.estimateStates[view.status]}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">{formatMoney(view.total)}</span>
                    {canPrintEstimate && (
                      <Link href={`/job-cards/${job.id}/estimates/${estimate.id}/print`} className={linkCls}>
                        Print
                        <span className="sr-only"> revision {view.version}</span>
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </StageCard>
      <StageCard title="Bills">
        <InvoicesTable invoices={invoices} />
      </StageCard>
      <StageCard title="Other prints">
        <ul className="space-y-2 text-sm">
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span>Gate pass {job.gatePassNumber ?? ""}</span>
            {job.gatePassNumber ? (
              <Button type="button" variant="outline" size="sm" onClick={onPrintGatePass}>
                <Printer aria-hidden="true" />
                Print gate pass
              </Button>
            ) : (
              <span className="text-muted-foreground">Issued when the vehicle is delivered</span>
            )}
          </li>
          {hasPermission("jobcard:picking-list:print") && (
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span>Picking list</span>
              <Link href={`/service-transactions/job-picking/${job.id}/print`} className={linkCls}>
                Print picking list
              </Link>
            </li>
          )}
        </ul>
        <CustomerExplanation text={job.customerRemarks} title="Explanation for the customer" />
      </StageCard>
    </>
  );
}

export function ActivityTab({ job, activity }: { job: JobCard; activity: StageActivity[] }) {
  const history = [...(job.statusHistory ?? [])].reverse();
  return (
    <>
      <JobCardLatePanel jobCard={job} />
      <StageCard title="Step changes" description="Who passed the job on, and to whom. Newest first.">
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No step changes are recorded. This job was opened before steps were tracked.</p>
        ) : (
          <ol className="space-y-3">
            {activity.map((entry) => {
              const owner = activityOwner(entry);
              return (
                <li key={entry.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{activityLine(entry)}</p>
                  <p className="text-muted-foreground">
                    {entry.by ?? "System"}, {formatDateTime(entry.at)}
                  </p>
                  {owner && <p>Sent to {owner}</p>}
                  {entry.note && <p className="mt-1 whitespace-pre-wrap break-words">{entry.note}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </StageCard>
      <StageCard title="Status changes" description="The job's status as reports see it. Newest first.">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No status changes are recorded.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {history.map((entry) => (
              <li key={entry.id} className="border-b border-border pb-2 last:border-0">
                <p className="font-medium">{jobStatusWords(canonicalJobStatus(entry.toStatus))}</p>
                <p className="text-muted-foreground">
                  {person(entry.actor)}, {formatDateTime(entry.createdAt)}
                </p>
                {entry.remarks && <p className="whitespace-pre-wrap break-words">{entry.remarks}</p>}
              </li>
            ))}
          </ol>
        )}
      </StageCard>
    </>
  );
}
