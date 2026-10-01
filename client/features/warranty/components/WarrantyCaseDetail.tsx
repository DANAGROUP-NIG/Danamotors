"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Car,
  Clock,
  Download,
  FileCheck2,
  Link2,
  MoreHorizontal,
  Pencil,
  Printer,
  RotateCcw,
  Send,
  Trash2,
  TriangleAlert,
  Undo2,
  User,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { cn } from "@/lib/utils";
import { useDeleteCaseLine, useImportCaseLines, useWarrantyCase } from "../hooks/use-warranty";
import {
  CASE_STATUS_LABELS,
  CASE_STATUS_TONES,
  COVERAGE_LABELS,
  COVERAGE_TONES,
  fmtDate,
  fmtDateTime,
  fmtKm,
  fmtNaira,
  personName,
} from "../lib/warranty-format";
import type { CaseLine, WarrantyCase } from "../types/warranty.types";
import { CaseActionDialog, EditClaimDetailsDialog, type SimpleAction } from "./CaseDialogs";
import { CaseLineDialog } from "./CaseLineDialog";
import { RecordDecisionDialog } from "./RecordDecisionDialog";
import { DetailField, PageState, Pill, SectionCard, Stepper, tdCls, thCls } from "./ui";

type LineDialog = { mode: { kind: "PART"; role: "CAUSAL" | "CONSEQUENTIAL" } | { kind: "LABOUR" }; line?: CaseLine } | null;

function LinesTable({
  lines,
  kind,
  editable,
  onEdit,
  onDelete,
}: {
  lines: CaseLine[];
  kind: "PART" | "LABOUR";
  editable: boolean;
  onEdit: (line: CaseLine) => void;
  onDelete: (line: CaseLine) => void;
}) {
  if (lines.length === 0) return <p className="py-3 text-sm text-slate-400">No lines yet.</p>;
  const isPart = kind === "PART";
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full">
        <thead className="border-b border-slate-200 bg-slate-50/60">
          <tr>
            <th className={thCls}>Seq</th>
            <th className={thCls}>{isPart ? "Part number" : "Operation"}</th>
            <th className={thCls}>Description</th>
            <th className={thCls}>Defect</th>
            {isPart && <th className={thCls}>Position</th>}
            {isPart && <th className={thCls}>Batch</th>}
            <th className={`${thCls} text-right`}>{isPart ? "Qty" : "Hours"}</th>
            <th className={`${thCls} text-right`}>Rate (₦)</th>
            <th className={`${thCls} text-right`}>Approval %</th>
            <th className={`${thCls} text-right`}>Claimed (₦)</th>
            <th className={`${thCls} text-right`}>Approved (₦)</th>
            <th className={thCls} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((l, i) => (
            <tr key={l.id} className={cn(l.approvedAmount != null && l.approvalPercent < 100 && "bg-amber-50/60")}>
              <td className={tdCls}>{i + 1}</td>
              <td className={`${tdCls} font-mono text-xs`}>{(isPart ? l.partNumber : l.operationCode) ?? "—"}</td>
              <td className={tdCls}>
                {l.description}
                {isPart && l.sparePart && !l.sparePart.warrantyApplicable && (
                  <span className="block text-xs text-red-600">No longer warranty-applicable</span>
                )}
              </td>
              <td className={tdCls}>{l.defectCode ? `${l.defectCode.code} · ${l.defectCode.description}` : <span className="text-slate-300">—</span>}</td>
              {isPart && <td className={tdCls}>{l.positionCode ? `${l.positionCode.code} · ${l.positionCode.description}` : <span className="text-slate-300">—</span>}</td>}
              {isPart && <td className={tdCls}>{l.batchNo ?? "—"}</td>}
              <td className={`${tdCls} text-right`}>{isPart ? l.quantity : l.quantity.toFixed(1)}</td>
              <td className={`${tdCls} text-right`}>{fmtNaira(l.rate)}</td>
              <td className={`${tdCls} text-right`}>{l.approvalPercent}%</td>
              <td className={`${tdCls} text-right`}>{fmtNaira(l.claimedAmount)}</td>
              <td className={`${tdCls} text-right font-medium`}>{l.approvedAmount == null ? "—" : fmtNaira(l.approvedAmount)}</td>
              <td className={`${tdCls} text-right`}>
                {editable && (
                  <ActionMenu
                    align="end"
                    trigger={
                      <button type="button" aria-label="Line actions" className="rounded-md border border-slate-200 p-1.5 hover:bg-slate-50">
                        <MoreHorizontal className="size-4" />
                      </button>
                    }
                  >
                    <ActionMenuItem icon={<Pencil />} onClick={() => onEdit(l)}>
                      Edit line
                    </ActionMenuItem>
                    <ActionMenuItem icon={<Trash2 />} onClick={() => onDelete(l)}>
                      Remove line
                    </ActionMenuItem>
                  </ActionMenu>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Screen 06 — the claim workbench for one warranty case. */
export function WarrantyCaseDetail({ id }: { id: string }) {
  const { data: c, isLoading, isError } = useWarrantyCase(id);
  const { hasPermission, isSuperAdmin } = useAuth();
  const can = (p: string) => isSuperAdmin || hasPermission(p);
  const canClaim = can(WARRANTY_PERMISSIONS.CLAIM);
  const canUpdate = can(WARRANTY_PERMISSIONS.UPDATE);
  const importLines = useImportCaseLines(id);
  const deleteLine = useDeleteCaseLine(id);

  const [lineDialog, setLineDialog] = useState<LineDialog>(null);
  const [action, setAction] = useState<SimpleAction | null>(null);
  const [deciding, setDeciding] = useState<"APPROVE" | "PARTIALLY_APPROVE" | "REJECT" | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);

  if (isLoading) return <PageState loading />;
  if (isError || !c) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/warranty" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Warranty Cases
        </Link>
        <p className="text-sm text-red-500">Warranty case not found, or you do not have access to it.</p>
      </div>
    );
  }

  const has = (a: WarrantyCase["allowedActions"][number]) => canClaim && c.allowedActions.includes(a);
  const editable = c.editable && canUpdate;
  const causal = c.lines.filter((l) => l.kind === "PART" && l.role === "CAUSAL");
  const consequential = c.lines.filter((l) => l.kind === "PART" && l.role === "CONSEQUENTIAL");
  const labour = c.lines.filter((l) => l.kind === "LABOUR");
  const deciding3 = has("APPROVE") || has("PARTIALLY_APPROVE") || has("REJECT");

  return (
    <div className="px-4 py-6 lg:px-6 print:px-0 print:py-0">
      {/* ── Top bar ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/warranty" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="size-4" /> Back to Warranty Cases
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-4" /> Print claim
          </Button>
          {editable && c.jobCard && (
            <Button size="sm" variant="outline" className="gap-1.5" disabled={importLines.isPending} onClick={() => importLines.mutate()}>
              <Download className="size-4" /> Import job card lines
            </Button>
          )}
          {has("RETURN") && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAction("RETURN")}>
              <Undo2 className="size-4" /> Return for correction
            </Button>
          )}
          {has("REJECT") && (
            <Button size="sm" variant="outline" className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50" onClick={() => setDeciding("REJECT")}>
              <XCircle className="size-4" /> Reject
            </Button>
          )}
          {has("CLOSE") && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAction("CLOSE")}>
              {["SETTLED", "REJECTED"].includes(c.status) ? "Close case" : "Withdraw"}
            </Button>
          )}
          {has("START_REVIEW") && (
            <Button size="sm" className="gap-1.5" onClick={() => setAction("START_REVIEW")}>
              <FileCheck2 className="size-4" /> Start review
            </Button>
          )}
          {has("RESUME") && (
            <Button size="sm" className="gap-1.5" onClick={() => setAction("RESUME")}>
              <RotateCcw className="size-4" /> Resume review
            </Button>
          )}
          {has("SUBMIT") && (
            <Button size="sm" className="gap-1.5" onClick={() => setAction("SUBMIT")}>
              <Send className="size-4" /> Submit to Kia
            </Button>
          )}
          {deciding3 && (
            <Button size="sm" onClick={() => setDeciding("APPROVE")}>
              Record decision
            </Button>
          )}
          {has("SETTLE") && (
            <Button size="sm" onClick={() => setAction("SETTLE")}>
              Record settlement
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* ── Header ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Warranty case</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{c.caseNumber}</h1>
            <Pill status={CASE_STATUS_LABELS[c.status]} tone={CASE_STATUS_TONES[c.status]} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {c.openedAutomatically ? "Opened automatically from " : "Opened from "}
            {c.jobCard?.jobNumber ?? "—"} · {c.branch.name}
            {c.assignedOfficer && ` · Officer: ${personName(c.assignedOfficer)}`}
          </p>

          <div className="my-6">
            <Stepper steps={c.progress} />
          </div>

          <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3 lg:grid-cols-6">
            <DetailField
              label="Kia claim no."
              value={
                <span className="inline-flex items-center gap-2 font-mono">
                  {c.manufacturerClaimNo ?? "—"}
                  {canUpdate && c.status !== "CLOSED" && (
                    <button type="button" aria-label="Edit claim details" onClick={() => setEditingDetails(true)} className="text-slate-400 hover:text-slate-700 print:hidden">
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </span>
              }
            />
            <DetailField label="Claim date" value={fmtDate(c.manufacturerClaimDate)} />
            <DetailField
              label="Job card"
              value={
                c.jobCard ? (
                  <Link href={`/job-cards/${c.jobCard.id}`} className="font-mono text-blue-700 underline-offset-2 hover:underline">
                    {c.jobCard.jobNumber}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <DetailField label="Job date" value={fmtDate(c.jobCard?.createdAt)} />
            <DetailField label="Bill date" value={fmtDate(c.billDate)} />
            <DetailField
              label="Complaint code"
              value={
                c.complaintCode ? (
                  `${c.complaintCode.code} · ${c.complaintCode.description}`
                ) : editable ? (
                  <button type="button" onClick={() => setEditingDetails(true)} className="text-amber-700 hover:underline">
                    Add complaint code
                  </button>
                ) : (
                  "—"
                )
              }
            />
          </div>
          {c.complaint && <p className="mt-3 text-sm text-slate-600">Complaint: {c.complaint}</p>}
          {c.status === "REJECTED" && c.rejectReason && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              Rejected: {c.rejectReason.code} · {c.rejectReason.description}
            </p>
          )}
          {c.status === "RETURNED" && c.statusHistory[0]?.remarks && (
            <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">Returned by the manufacturer: {c.statusHistory[0].remarks}</p>
          )}
        </div>

        {/* ── Vehicle & customer ── */}
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <SectionCard icon={<Car />} title="Vehicle">
            <div className="grid gap-4 sm:grid-cols-3">
              <DetailField label="Model" value={[c.vehicle.make, c.vehicle.model].filter(Boolean).join(" ")} />
              <DetailField label="Variant" value={c.vehicle.trim} />
              <DetailField label="Sale date" value={fmtDate(c.vehicle.warrantyStartDate)} />
              <DetailField label="VIN" value={<Link href={`/vehicles/${c.vehicle.id}`} className="font-mono hover:underline">{c.vehicle.vin}</Link>} />
              <DetailField label="Mileage" value={fmtKm(c.mileage)} />
              <div>
                {c.coverageStatus && (
                  <Pill
                    status={c.coverageStatus === "ACTIVE" ? "Covered at creation" : `${COVERAGE_LABELS[c.coverageStatus]} at creation`}
                    tone={COVERAGE_TONES[c.coverageStatus]}
                  />
                )}
              </div>
            </div>
          </SectionCard>
          <SectionCard icon={<User />} title="Customer">
            {c.customer ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Name" value={`${c.customer.firstName} ${c.customer.lastName}`} />
                <DetailField label="Email" value={c.customer.email} />
                <DetailField label="Phone" value={c.customer.phoneNumber} />
                <DetailField label="Branch" value={c.branch.name} />
              </div>
            ) : (
              <p className="text-sm text-slate-400">No customer on this case.</p>
            )}
          </SectionCard>
        </div>

        {/* ── Lines ── */}
        <SectionCard
          icon={<TriangleAlert className="text-red-500" />}
          title="Causal Part"
          note="The part that failed."
          action={
            editable && (
              <Button size="sm" variant="outline" disabled={causal.length > 0} onClick={() => setLineDialog({ mode: { kind: "PART", role: "CAUSAL" } })}>
                Add causal part
              </Button>
            )
          }
        >
          <LinesTable lines={causal} kind="PART" editable={editable} onEdit={(line) => setLineDialog({ mode: { kind: "PART", role: "CAUSAL" }, line })} onDelete={(l) => deleteLine.mutate(l.id)} />
        </SectionCard>

        <SectionCard
          icon={<Link2 />}
          title="Consequential Parts"
          note="Parts damaged as a result."
          action={
            editable && (
              <Button size="sm" variant="outline" onClick={() => setLineDialog({ mode: { kind: "PART", role: "CONSEQUENTIAL" } })}>
                Add consequential part
              </Button>
            )
          }
        >
          <LinesTable
            lines={consequential}
            kind="PART"
            editable={editable}
            onEdit={(line) => setLineDialog({ mode: { kind: "PART", role: "CONSEQUENTIAL" }, line })}
            onDelete={(l) => deleteLine.mutate(l.id)}
          />
        </SectionCard>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <SectionCard
            icon={<Wrench />}
            title="Labour"
            action={
              editable && (
                <Button size="sm" variant="outline" onClick={() => setLineDialog({ mode: { kind: "LABOUR" } })}>
                  Add labour
                </Button>
              )
            }
          >
            <LinesTable lines={labour} kind="LABOUR" editable={editable} onEdit={(line) => setLineDialog({ mode: { kind: "LABOUR" }, line })} onDelete={(l) => deleteLine.mutate(l.id)} />
          </SectionCard>

          <div className="self-start rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Claim Summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Claimed total</dt>
                <dd className="text-base font-bold">{fmtNaira(c.claimedAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Approved total</dt>
                <dd className="font-semibold">{fmtNaira(c.approvedAmount)}</dd>
              </div>
              {c.settledAmount != null && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Settled</dt>
                  <dd className="font-semibold">{fmtNaira(c.settledAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Settlement ref.</dt>
                <dd>{c.settlementRef ?? "—"}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* ── History ── */}
        <SectionCard icon={<Clock />} title="Status History">
          <ol className="relative space-y-4 border-l border-slate-200 pl-6">
            {c.statusHistory.map((h) => (
              <li key={h.id} className="relative grid gap-1 sm:grid-cols-[150px_180px_160px_1fr] sm:items-center sm:gap-4">
                <span className="absolute -left-[29px] top-2 size-2.5 rounded-full border-2 border-white bg-primary ring-1 ring-slate-300" />
                <span>
                  <Pill status={CASE_STATUS_LABELS[h.toStatus]} tone={CASE_STATUS_TONES[h.toStatus]} />
                </span>
                <span className="text-sm text-slate-700">{h.actor ? personName(h.actor) : "System"}</span>
                <span className="text-sm text-slate-500">{fmtDateTime(h.createdAt)}</span>
                <span className="text-sm text-slate-600">{h.remarks ?? ""}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      </div>

      {lineDialog && <CaseLineDialog caseId={c.id} mode={lineDialog.mode} line={lineDialog.line} onClose={() => setLineDialog(null)} />}
      {action && <CaseActionDialog warrantyCase={c} action={action} onClose={() => setAction(null)} />}
      {deciding && <RecordDecisionDialog warrantyCase={c} initial={deciding} onClose={() => setDeciding(null)} />}
      {editingDetails && <EditClaimDetailsDialog warrantyCase={c} onClose={() => setEditingDetails(false)} />}
    </div>
  );
}
