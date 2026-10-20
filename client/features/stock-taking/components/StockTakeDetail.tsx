"use client";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, CheckCheck, ClipboardCheck, FileBarChart, History, Loader2, MapPin, Pencil, Plus, Printer, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { STOCK_TAKE_PERMISSIONS } from "@/features/auth/roles";
import { DetailField } from "@/features/part-sale/components/OrderDetail";
import { useCancelSheet, useCancelStockTake, useSetNotRequired, useStockTake, useStockTakeLines, useStockTakeMovements } from "../hooks/use-stock-taking";
import {
  AUDIT_LEVEL_LABELS,
  KINDS,
  MOVEMENT_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
  fmtCurrency,
  fmtDate,
  fmtDateTime,
  fmtDiff,
  kindOf,
  sheetIsOpen,
  sheetStatus,
  userName,
} from "../lib/stock-taking-format";
import { AddCountDialog, BinUpdateDialog, CompleteDialog, ConfirmDialog, CorrectLineDialog, NewSheetDialog, RemarkDialog } from "./StockTakeDialogs";
import type { CountSheet, Kind, LineFilter, StockTakeLine } from "../types/stock-taking.types";

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";
const PAGE_SIZE = 50;
const LINE_FILTERS: { label: string; value: LineFilter }[] = [
  { label: "All parts", value: "ALL" },
  { label: "Not counted", value: "UNCOUNTED" },
  { label: "Shortage / excess", value: "DISCREPANCY" },
  { label: "Damaged", value: "DAMAGED" },
  { label: "Not in Part Master", value: "UNKNOWN" },
];

type Dialog = "sheet" | "count" | "complete" | "confirm" | "bins" | "cancel" | null;

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "red" | "emerald" | "amber" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold text-slate-800",
          tone === "red" && "text-red-700",
          tone === "emerald" && "text-emerald-700",
          tone === "amber" && "text-amber-700",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

/**
 * One stock taking (legacy Upload Physical Stock Data, Upload/Download Status, S/E Confirmation), or
 * one stock audit, which stops at Complete.
 */
export function StockTakeDetail({ id, kind = "COUNT" }: { id: string; kind?: Kind }) {
  const router = useRouter();
  const { data: take, isLoading, error } = useStockTake(id);
  const { hasPermission } = useAuth();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [correcting, setCorrecting] = useState<StockTakeLine | null>(null);
  const [cancellingSheet, setCancellingSheet] = useState<CountSheet | null>(null);
  const [filter, setFilter] = useState<LineFilter>("ALL");
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1);
  const [showMovements, setShowMovements] = useState(false);
  const lines = useStockTakeLines(id, { filter, search: committed || undefined, page, pageSize: PAGE_SIZE });
  const movements = useStockTakeMovements(id, showMovements);
  const cancel = useCancelStockTake(id);
  const cancelSheet = useCancelSheet(id);
  const notRequired = useSetNotRequired(id);

  if (isLoading) {
    return <LoadingSkeleton variant="detail" />;
  }
  if (error || !take) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href={KINDS[kind].base} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to {KINDS[kind].title}
        </Link>
        <p className="text-sm text-red-500">{KINDS[kind].title} not found, or you do not have access to it.</p>
      </div>
    );
  }

  const k = KINDS[kindOf(take.type)];
  const audit = take.type === "AUDIT";
  const s = take.summary;
  const active = take.status === "ACTIVE";
  const canManage = hasPermission(k.permissions.MANAGE);
  // An audit only reports: no S/E confirmation or bin update, and once completed it is final.
  const canConfirm = !audit && take.status === "COMPLETED" && hasPermission(STOCK_TAKE_PERMISSIONS.CONFIRM);
  const canBins = !audit && canManage && (take.status === "COMPLETED" || take.status === "CONFIRMED") && !take.binsUpdatedAt;
  const canCancel = canManage && (active || (!audit && take.status === "COMPLETED"));
  const reportHref = `/parts-reports/${k.report}?search=${take.batchNumber}&branchId=${take.branchId}`;

  const columns: Column<StockTakeLine>[] = [
    {
      header: "Part",
      render: (l) => (
        <span>
          {l.partId ? (
            <Link href={`/inventory/${l.partId}`} className="font-mono font-medium hover:underline">
              {l.partNumber}
            </Link>
          ) : (
            <span className="font-mono font-medium text-red-700">{l.partNumber}</span>
          )}
          {l.addedDuringCount && <span className="ml-1.5 text-xs text-amber-700">found</span>}
        </span>
      ),
    },
    { header: "Flag", render: (l) => <span className="text-muted-foreground">{l.part?.partFlag ?? ""}</span> },
    {
      header: "Description",
      className: "max-w-56 truncate",
      render: (l) => l.part?.name ?? <span className="text-red-600">{l.notRequired ? "Not in Part Master · not required" : "Not in Part Master"}</span>,
    },
    { header: "Bin", render: (l) => <span className="font-mono text-muted-foreground">{l.binLocation ?? "—"}</span> },
    { header: "System", headerClassName: "text-right", className: "text-right", render: (l) => l.stockAtCount ?? l.systemStock },
    {
      header: "Physical",
      headerClassName: "text-right",
      className: "text-right",
      render: (l) => (l.countedQuantity == null ? <span className="text-amber-700">—</span> : l.countedQuantity),
    },
    {
      header: "Damaged",
      headerClassName: "text-right",
      className: "text-right",
      render: (l) => <span className={l.damagedQuantity ? "text-orange-700" : "text-slate-300"}>{l.damagedQuantity}</span>,
    },
    {
      header: "Discrepancy",
      headerClassName: "text-right",
      className: "text-right",
      render: (l) => (
        <span className={cn("font-medium", (l.discrepancy ?? 0) > 0 && "text-emerald-700", (l.discrepancy ?? 0) < 0 && "text-red-700", !l.discrepancy && "text-slate-400")}>
          {fmtDiff(l.discrepancy)}
          {l.discrepancy ? <span className="block text-xs font-normal">{fmtCurrency(Math.abs(l.discrepancy) * l.rate)}</span> : null}
        </span>
      ),
    },
    { header: "Found in", render: (l) => <span className="font-mono text-muted-foreground">{l.countedBins ?? ""}</span> },
    {
      header: "Checker",
      render: (l) => <span className="text-muted-foreground">{l.sheet ? `${userName(l.sheet.checker) || "—"} · ${l.sheet.sheetNumber}` : ""}</span>,
    },
    { header: "Remarks", className: "max-w-48 truncate", render: (l) => <span className="text-muted-foreground">{l.remarks ?? ""}</span> },
    ...(active && canManage
      ? [
          {
            header: "",
            className: "text-right print:hidden",
            headerClassName: "print:hidden",
            render: (l: StockTakeLine) => (
              <div className="flex justify-end gap-1">
                {!l.partId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={notRequired.isPending}
                    onClick={() => notRequired.mutate({ lineId: l.id, notRequired: !l.notRequired })}
                  >
                    {l.notRequired ? "Required" : "Not required"}
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="gap-1" onClick={() => setCorrecting(l)}>
                  <Pencil className="size-3.5" /> Correct
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="px-4 py-6 lg:px-6 print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={k.base} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to {k.title}
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href={reportHref}>
              <FileBarChart className="size-4" /> Report
            </Link>
          </Button>
          {canCancel && (
            <Button size="sm" variant="outline" className="gap-1.5 text-red-600" onClick={() => setDialog("cancel")}>
              <Ban className="size-4" /> Cancel
            </Button>
          )}
          {canBins && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog("bins")}>
              <MapPin className="size-4" /> Update bins
            </Button>
          )}
          {active && canManage && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog("count")}>
                <Plus className="size-4" /> Add count
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog("sheet")}>
                <ScanLine className="size-4" /> Issue count sheet
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setDialog("complete")}>
                <ClipboardCheck className="size-4" /> Complete
              </Button>
            </>
          )}
          {canConfirm && (
            <Button size="sm" className="gap-1.5" onClick={() => setDialog("confirm")}>
              <CheckCheck className="size-4" /> Confirm S/E
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                {audit && take.auditLevel ? AUDIT_LEVEL_LABELS[take.auditLevel] : `${TYPE_LABELS[take.type]} stock taking`} · {take.branch.name}
              </p>
              <h1 className="font-mono text-xl font-semibold text-slate-800">{take.batchNumber}</h1>
            </div>
            <StatusBadge status={STATUS_LABELS[take.status]} tone={STATUS_TONES[take.status]} />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <DetailField label="Batch date" value={fmtDateTime(take.createdAt)} />
            <DetailField label="Created by" value={userName(take.createdBy) || null} />
            {audit && <DetailField label="Auditors" value={take.auditors} />}
            <DetailField label="Completed" value={take.completedAt && `${fmtDateTime(take.completedAt)} · ${userName(take.completedBy)}`} />
            {!audit && (
              <DetailField label="S/E confirmed" value={take.confirmedAt && `${fmtDateTime(take.confirmedAt)} · ${userName(take.confirmedBy)}`} />
            )}
            {take.binsUpdatedAt && <DetailField label="Bins updated" value={fmtDateTime(take.binsUpdatedAt)} />}
            {take.remarks && <DetailField wide label="Remarks" value={take.remarks} />}
            {take.cancelRemark && (
              <DetailField wide label="Cancelled" value={`${fmtDate(take.cancelledAt)} · ${userName(take.cancelledBy)} · ${take.cancelRemark}`} />
            )}
          </div>
          {active && take.type === "ANNUAL" && (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 print:hidden">
              Stock of the parts in this count cannot move at {take.branch.name} until the count is completed.
            </p>
          )}
          {audit && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 print:hidden">
              This audit reports shortage and excess against system stock when each part was counted. It does not adjust stock or bins.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Stat label="Parts" value={s.lines} sub={s.unknown ? `${s.unknown} not in Part Master` : undefined} />
          <Stat label="Counted" value={s.counted} sub={s.uncounted ? `${s.uncounted} not counted` : "All counted"} tone={s.uncounted ? "amber" : undefined} />
          <Stat label="Physical qty" value={s.physicalQuantity} sub={`System ${s.systemQuantity}`} />
          <Stat label="Damaged qty" value={s.damagedQuantity} />
          <Stat label="Excess" value={s.excessQuantity} sub={fmtCurrency(s.excessValue)} tone="emerald" />
          <Stat label="Shortage" value={s.shortageQuantity} sub={fmtCurrency(s.shortageValue)} tone="red" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 print:hidden">
          <p className="mb-4 text-sm font-semibold text-slate-700">Count sheets</p>
          {take.sheets.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-muted-foreground">
              {active ? "No count sheets yet. Issue one to each checker, or add counts directly." : "No count sheets were issued."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={thCls}>Sheet #</th>
                    <th className={thCls}>Checker</th>
                    <th className={thCls}>Selection</th>
                    <th className={thCls}>Issued</th>
                    <th className={cn(thCls, "text-right")}>Parts</th>
                    <th className={cn(thCls, "text-right")}>Counted</th>
                    <th className={thCls}>Uploaded</th>
                    <th className={thCls}>Status</th>
                    <th className={thCls} />
                  </tr>
                </thead>
                <tbody>
                  {take.sheets.map((sheet) => {
                    const status = sheetStatus(sheet);
                    return (
                      <tr key={sheet.id} className="border-t border-slate-100">
                        <td className={cn(tdCls, "font-mono font-medium")}>
                          <Link href={`${k.base}/${take.id}/sheets/${sheet.id}`} className="hover:underline">
                            {sheet.sheetNumber}
                          </Link>
                        </td>
                        <td className={tdCls}>{userName(sheet.checker) || "—"}</td>
                        <td className={cn(tdCls, "text-slate-500")}>{sheet.criteria}</td>
                        <td className={cn(tdCls, "text-slate-500")}>{fmtDateTime(sheet.issuedAt)}</td>
                        <td className={cn(tdCls, "text-right")}>{sheet.lineCount}</td>
                        <td className={cn(tdCls, "text-right")}>{sheet.countedCount ?? "—"}</td>
                        <td className={cn(tdCls, "text-slate-500")}>{sheet.uploadedAt ? `${fmtDateTime(sheet.uploadedAt)} · ${userName(sheet.uploadedBy)}` : "—"}</td>
                        <td className={tdCls}>
                          <StatusBadge status={status.label} tone={status.tone} />
                        </td>
                        <td className={cn(tdCls, "text-right")}>
                          {active && canManage && sheetIsOpen(sheet) && (
                            <div className="flex justify-end gap-1">
                              <Button asChild size="sm" variant="outline">
                                <Link href={`${k.base}/${take.id}/sheets/${sheet.id}`}>Enter counts</Link>
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setCancellingSheet(sheet)}>
                                Cancel
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DataTable
          columns={columns}
          data={lines.data?.lines ?? []}
          isLoading={lines.isLoading}
          isFetching={lines.isFetching}
          rowKey={(l) => l.id}
          emptyMessage={committed || filter !== "ALL" ? "No parts match." : "No parts in this count."}
          page={page}
          pageSize={PAGE_SIZE}
          total={lines.data?.total ?? 0}
          totalPages={Math.max(1, Math.ceil((lines.data?.total ?? 0) / PAGE_SIZE))}
          onPageChange={setPage}
        >
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <form
              className="w-full sm:w-80"
              onSubmit={(e) => {
                e.preventDefault();
                setCommitted(search.trim());
                setPage(1);
              }}
            >
              <input className={inputCls} placeholder="Find part, description or bin, then Enter…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </form>
            <DataTableFilterChips
              options={LINE_FILTERS}
              selected={filter}
              onChange={(v) => {
                setFilter(v as LineFilter);
                setPage(1);
              }}
            />
          </div>
        </DataTable>

        <div className="rounded-xl border border-slate-200 bg-white p-6 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-700">Stock movements since the batch was created</p>
              <p className="text-sm text-muted-foreground">Receipts and issues of these parts at {take.branch.name} during and after the count.</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowMovements((v) => !v)}>
              <History className="size-4" /> {showMovements ? "Hide" : "Show"}
            </Button>
          </div>
          {showMovements &&
            (movements.isLoading ? (
              <Loader2 className="mx-auto mt-4 size-5 animate-spin text-slate-400" />
            ) : !movements.data?.length ? (
              <p className="mt-4 text-sm text-muted-foreground">No stock of these parts has moved since the batch was created.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={thCls}>Date</th>
                      <th className={thCls}>Type</th>
                      <th className={thCls}>Part</th>
                      <th className={cn(thCls, "text-right")}>Qty (+/−)</th>
                      <th className={thCls}>Notes</th>
                      <th className={thCls}>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.data.map((m) => (
                      <tr key={m.id} className="border-t border-slate-100">
                        <td className={cn(tdCls, "text-slate-500")}>{fmtDateTime(m.createdAt)}</td>
                        <td className={tdCls}>{m.referenceId === take.id ? "This count's adjustment" : (MOVEMENT_LABELS[m.type] ?? m.type)}</td>
                        <td className={tdCls}>
                          <span className="font-mono font-medium">{m.partNumber}</span> <span className="text-slate-500">{m.name}</span>
                        </td>
                        <td className={cn(tdCls, "text-right font-medium", m.quantity > 0 ? "text-emerald-700" : "text-red-700")}>{fmtDiff(m.quantity)}</td>
                        <td className={cn(tdCls, "max-w-72 truncate text-slate-500")}>{m.notes}</td>
                        <td className={cn(tdCls, "text-slate-500")}>{m.by ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      </div>

      {dialog === "sheet" && (
        <NewSheetDialog take={take} onClose={() => setDialog(null)} onIssued={(sheetId) => router.push(`${k.base}/${take.id}/sheets/${sheetId}`)} />
      )}
      {dialog === "count" && <AddCountDialog take={take} onClose={() => setDialog(null)} />}
      {dialog === "complete" && <CompleteDialog take={take} onClose={() => setDialog(null)} />}
      {dialog === "confirm" && <ConfirmDialog take={take} onClose={() => setDialog(null)} />}
      {dialog === "bins" && <BinUpdateDialog take={take} onClose={() => setDialog(null)} />}
      {dialog === "cancel" && (
        <RemarkDialog
          title={`Cancel ${k.noun} ${take.batchNumber}`}
          description={`Counts recorded so far are discarded${audit ? "" : " and stock is not adjusted"}.${take.type === "ANNUAL" && active ? " The stock of its parts is free to move again." : ""}`}
          action={`Cancel ${k.noun}`}
          pending={cancel.isPending}
          onSubmit={(remark) => cancel.mutate(remark, { onSuccess: () => setDialog(null) })}
          onClose={() => setDialog(null)}
        />
      )}
      {cancellingSheet && (
        <RemarkDialog
          title={`Cancel count sheet ${cancellingSheet.sheetNumber}`}
          description="Its parts go back to the pool so they can be put on another sheet."
          action="Cancel sheet"
          pending={cancelSheet.isPending}
          onSubmit={(remark) => cancelSheet.mutate({ sheetId: cancellingSheet.id, remark }, { onSuccess: () => setCancellingSheet(null) })}
          onClose={() => setCancellingSheet(null)}
        />
      )}
      {correcting && <CorrectLineDialog take={take} line={correcting} onClose={() => setCorrecting(null)} />}
    </div>
  );
}
