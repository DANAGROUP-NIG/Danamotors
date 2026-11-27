"use client";
import { useState } from "react";
import { ArrowRight, FileText, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { formatDateTime, formatTime, NOT_PROVIDED } from "@/lib/format";
import { usePrepareSupplementary } from "../../hooks/use-job-repair";
import type { JobFileTab } from "../../lib/job-frame.logic";
import { FINDING_STATE_BADGE, PART_STATUS_BADGE, PAYER_TAG, WORK_STATUS_BADGE, hoursText, newFindingBanner, partsSummary, timeWorkedText } from "../../lib/repair.logic";
import type { JobCard } from "../../types/job-card.types";
import type { JobRepairStep } from "../../types/job-repair.types";
import type { StageBarProps } from "../check-in/CheckInStep";
import { SupplementaryEstimate } from "../estimate/EstimateStep";
import { StageActionBar } from "../workspace/StageActionBar";
import { StageCard } from "../workspace/StageCard";
import { AssignTechnicianSection } from "../workspace/WorkshopSections";

const th = "px-3 py-2 text-left text-sm font-semibold text-muted-foreground";
const td = "px-3 py-2 align-top";

/**
 * The service advisor's view of the repair (desktop first): new findings with Prepare supplementary
 * estimate, work progress, parts and labour recorded. Others see the same, read only.
 */
export function RepairMonitor({ job, step, bar, onOpenTab }: { job: JobCard; step: JobRepairStep; bar: StageBarProps; onOpenTab: (tab: JobFileTab) => void }) {
  const prepare = usePrepareSupplementary(job.id);
  const [requestId] = useState(() => crypto.randomUUID());
  const [failure, setFailure] = useState<string | null>(null);
  const banner = newFindingBanner(step.findings);
  const openSupplementary = !!step.supplementary && step.supplementary.state !== "DECIDED";
  const done = step.workLines.filter((line) => line.status === "DONE").length;
  const percent = step.workLines.length ? Math.round((done / step.workLines.length) * 100) : 0;

  function prepareSupplementary() {
    if (prepare.isPending) return;
    setFailure(null);
    prepare
      .mutateAsync(requestId)
      .then((result) => {
        toast.success(result.estimate ? `Supplementary estimate, revision ${result.estimate.version}, prepared for job ${step.jobNumber}` : `Supplementary estimate prepared for job ${step.jobNumber}`);
        // The estimate opens below the progress tables: take the advisor there.
        // The app scrolls inside its content area; scroll that, not the page frame.
        window.setTimeout(() => {
          const target = document.getElementById("supplementary-estimate");
          const area = target?.closest("main");
          if (target && area) area.scrollTo({ top: area.scrollTop + target.getBoundingClientRect().top - area.getBoundingClientRect().top - 160, behavior: "smooth" });
        }, 300);
      })
      .catch((error: unknown) => setFailure(apiErrorMessage(error, "The supplementary estimate was not prepared. Check your connection and try again.")));
  }

  return (
    <>
      {banner && (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center">
          <Wrench className="size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <p>
              <span className="font-semibold">{banner.text}</span> The customer must approve before this work is done.
            </p>
            <p className="text-amber-900">Work already approved continues.</p>
            {failure && (
              <p role="alert" className="mt-1 text-destructive">
                {failure}
              </p>
            )}
          </div>
          {step.access.canPrepareSupplementary ? (
            <Button type="button" className="shrink-0" disabled={prepare.isPending} onClick={prepareSupplementary}>
              {prepare.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              {prepare.isPending ? "Preparing" : "Prepare supplementary estimate"}
            </Button>
          ) : (
            <p className="text-sm sm:max-w-56">{step.serviceAdvisor ?? "The service advisor"} prepares the supplementary estimate.</p>
          )}
        </div>
      )}
      {openSupplementary && !step.access.canPrepareSupplementary && (
        <p role="status" className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
          Supplementary estimate, revision {step.supplementary!.version}, is waiting for the customer&apos;s answer. The new work is locked until then.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4">
        <StageCard title="Work progress" description="Approved work and its current status from the workshop.">
          {step.workLines.length === 0 ? (
            <div className="space-y-3 text-sm">
              <p>No work list for this job. It was released before work lists were kept, so the approved work is on the estimate.</p>
              <Button type="button" variant="outline" onClick={() => onOpenTab("documents")}>
                <FileText aria-hidden="true" />
                View the estimate
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {done} of {step.workLines.length} done
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Work done" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th scope="col" className={th}>
                        Work (approved)
                      </th>
                      <th scope="col" className={th}>
                        Status
                      </th>
                      <th scope="col" className={th}>
                        Technician
                      </th>
                      <th scope="col" className={`${th} text-right`}>
                        Time spent
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {step.workLines.map((line) => (
                      <tr key={line.id}>
                        <td className={td}>
                          <p className="font-medium">{line.description}</p>
                          <p className="text-xs text-muted-foreground">
                            Approved {hoursText(line.hours)}
                            {line.supplementary ? ", added during repair" : ""}
                          </p>
                        </td>
                        <td className={td}>
                          <div className="flex flex-wrap gap-1">
                            <StatusBadge status={WORK_STATUS_BADGE[line.status].label} tone={WORK_STATUS_BADGE[line.status].tone} className="text-xs normal-case" />
                            {PAYER_TAG[line.payer] && <StatusBadge status={PAYER_TAG[line.payer]!} tone="purple" className="text-xs normal-case" />}
                          </div>
                          {line.doneAt && <p className="mt-1 text-xs text-muted-foreground">Completed at {formatTime(line.doneAt)}</p>}
                        </td>
                        <td className={td}>{line.technician ?? step.technician ?? NOT_PROVIDED}</td>
                        <td className={`${td} text-right tabular-nums`}>{line.status === "NOT_STARTED" ? "Not started" : timeWorkedText(line.secondsWorked)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </StageCard>

        <div className="min-w-0 space-y-4">
          <StageCard title="Parts" description="Requested, issued and collected for this job." id="job-parts">
            {step.parts.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No parts were requested for this job.</p>
            ) : (
              <>
                <p className="text-sm">{partsSummary(step.parts)}</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        <th scope="col" className={th}>
                          Part
                        </th>
                        <th scope="col" className={`${th} text-right`}>
                          Qty
                        </th>
                        <th scope="col" className={th}>
                          Requested
                        </th>
                        <th scope="col" className={th}>
                          Issued by store
                        </th>
                        <th scope="col" className={th}>
                          Collected by technician
                        </th>
                        <th scope="col" className={th}>
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {step.parts.rows.map((row) => (
                        <tr key={row.sparePartId}>
                          <td className={`${td} font-medium`}>{row.description}</td>
                          <td className={`${td} text-right tabular-nums`}>{row.requested.toLocaleString("en-NG", { maximumFractionDigits: 2 })}</td>
                          <td className={td}>{row.requestedAt ? formatDateTime(row.requestedAt) : NOT_PROVIDED}</td>
                          <td className={td}>
                            {row.issuedAt ? (
                              <>
                                {formatDateTime(row.issuedAt)}
                                {row.issuedBy && <span className="block text-xs text-muted-foreground">{row.issuedBy}</span>}
                              </>
                            ) : (
                              "Not issued yet"
                            )}
                          </td>
                          <td className={td}>
                            {row.collectedAt ? (
                              <>
                                {formatDateTime(row.collectedAt)}
                                {row.collectedBy && <span className="block text-xs text-muted-foreground">{row.collectedBy}</span>}
                              </>
                            ) : (
                              "Not collected yet"
                            )}
                          </td>
                          <td className={td}>
                            <StatusBadge status={PART_STATUS_BADGE[row.status].label} tone={PART_STATUS_BADGE[row.status].tone} className="text-xs normal-case" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </StageCard>

          <StageCard title="Labour recorded" description="Labour logged when the technician marks work done.">
            {step.labour.length === 0 ? (
              <p className="text-sm text-muted-foreground">No labour recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th scope="col" className={th}>
                        Operation
                      </th>
                      <th scope="col" className={`${th} text-right`}>
                        Hours
                      </th>
                      <th scope="col" className={th}>
                        Technician
                      </th>
                      <th scope="col" className={th}>
                        Recorded
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {step.labour.map((row) => (
                      <tr key={row.id}>
                        <td className={`${td} font-medium`}>{row.description}</td>
                        <td className={`${td} text-right tabular-nums`}>{hoursText(row.hours)}</td>
                        <td className={td}>{row.technician ?? NOT_PROVIDED}</td>
                        <td className={td}>{formatDateTime(row.recordedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </StageCard>
        </div>
      </div>

      {step.findings.length > 0 && (
        <StageCard title="Found during repair">
          <ul className="divide-y divide-border text-sm">
            {step.findings.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-medium">{item.description}</p>
                  <p className="text-muted-foreground">
                    {item.items.map((row) => (row.kind === "LABOUR" ? row.description : `${row.description}, qty ${Number(row.quantity).toLocaleString("en-NG")}`)).join("; ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.raisedBy ?? NOT_PROVIDED}, {formatDateTime(item.raisedAt)}
                  </p>
                </div>
                <StatusBadge status={FINDING_STATE_BADGE[item.state].label} tone={FINDING_STATE_BADGE[item.state].tone} className="shrink-0 self-start text-xs normal-case" />
              </li>
            ))}
          </ul>
        </StageCard>
      )}

      <AssignTechnicianSection job={job} />

      {openSupplementary && step.access.canPrepareSupplementary ? (
        <>
          <div id="supplementary-estimate" className="scroll-mt-40" />
          <SupplementaryEstimate job={job} bar={bar} />
        </>
      ) : (
        <StageActionBar {...bar} />
      )}
    </>
  );
}
