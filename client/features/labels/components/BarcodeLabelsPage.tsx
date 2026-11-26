"use client";

import { useMemo, useState } from "react";
import { Printer, RotateCcw, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { PartPicker, type PartSearchQuery } from "@/features/stock-transfers/components/PartPicker";
import { fmtDateTime } from "@/features/stock-transfers/lib/indent-status";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { useBranchStore } from "@/store/branch.store";
import { cn } from "@/lib/utils";
import { labelKeys, searchLabelPartsRequest } from "../api/labels.api";
import { useCancelLabelJob, useLabelJobs, useLabelPrinters, usePrintLabels, useRetryLabelJob } from "../hooks/use-labels";
import { JobStatusBadge, LabelPreview, PrinterLine } from "./label-parts";
import type { LabelPart } from "../types/labels.types";
import { NumberInput } from "@/components/forms/NumberInput";

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";
const MAX_COPIES = 100;

type Line = { part: LabelPart; copies: string };

const copiesOf = (l: Line) => Math.min(MAX_COPIES, Math.max(0, Math.floor(Number(l.copies) || 0)));

/**
 * Legacy Barcode Printing (BarCode.dll), part labels: pick parts, set copies, print on the branch's label
 * printer (a Zebra on a handheld station PC). 2" x 2" labels as on the Kia factory labels, without QTY.
 */
export function BarcodeLabelsPage() {
  const { user, hasPermission } = useAuth();
  const crossBranch = hasPermission(INVENTORY_PERMISSIONS.INVENTORY_CROSS_BRANCH);
  const branches = useBranchStore((s) => s.branches);
  const [branchId, setBranchId] = useState<string>(user?.branchId ?? "");
  const scope = crossBranch ? branchId || undefined : undefined;
  const branch = branches.find((b) => b.id === (scope ?? user?.branchId));
  const store = branch?.shortName || branch?.code || branch?.name || "";

  const [lines, setLines] = useState<Line[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const ready = !crossBranch || !!branchId;
  const printers = useLabelPrinters(scope, ready);
  const jobs = useLabelJobs(scope, ready);
  const print = usePrintLabels();
  const retry = useRetryLabelJob();
  const cancel = useCancelLabelJob();

  const searchQuery: PartSearchQuery = (search) => ({
    queryKey: labelKeys.parts(search, scope),
    queryFn: () => searchLabelPartsRequest(search, scope),
  });

  const total = lines.reduce((n, l) => n + copiesOf(l), 0);
  const invalid = lines.some((l) => copiesOf(l) < 1);
  const preview = useMemo(() => lines.find((l) => l.part.id === previewId) ?? lines[lines.length - 1], [lines, previewId]);

  const add = (part: LabelPart) => {
    setLines((cur) => {
      const at = cur.findIndex((l) => l.part.id === part.id);
      if (at < 0) return [...cur, { part, copies: "1" }];
      return cur.map((l, i) => (i === at ? { ...l, copies: String(Math.min(MAX_COPIES, copiesOf(l) + 1)) } : l));
    });
    setPreviewId(part.id);
  };

  const submit = () =>
    print.mutate(
      { branchId: scope, labels: lines.map((l) => ({ partId: l.part.id, copies: copiesOf(l) })) },
      { onSuccess: () => setLines([]) },
    );

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Barcode Labels"
        description={`Print 2" × 2" part labels on the branch's label printer: description, part number, barcode and bin. Each label scans on the handheld.`}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="grid content-start gap-4">
            {crossBranch && (
              <Field label="Branch" required>
                <select
                  className={inputCls}
                  value={branchId}
                  onChange={(e) => {
                    setBranchId(e.target.value);
                    setLines([]);
                  }}
                >
                  <option value="">Select branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {ready && <PrinterLine printers={printers.data} loading={printers.isLoading} />}
            <Field label="Add a part">
              <PartPicker
                disabled={!ready}
                searchQuery={searchQuery}
                placeholder="Scan or type a part number, or search by name…"
                onSelect={(p) => add(p as unknown as LabelPart)}
                renderMeta={(p) => {
                  const part = p as unknown as LabelPart;
                  return (
                    <>
                      <span className="block font-medium">{part.bin ? `Bin ${part.bin}` : <span className="text-slate-400">No bin</span>}</span>
                      <span className="block text-muted-foreground">{part.stock} in stock</span>
                    </>
                  );
                }}
              />
            </Field>
          </div>
          {preview && <LabelPreview partNumber={preview.part.partNumber} description={preview.part.name} bin={preview.part.bin} store={store} />}
        </div>

        {lines.length > 0 && (
          <>
            <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={thCls}>Part number</th>
                    <th className={thCls}>Description</th>
                    <th className={thCls}>Bin</th>
                    <th className={cn(thCls, "w-28")}>Copies</th>
                    <th className={thCls} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr
                      key={l.part.id}
                      className={cn("cursor-pointer border-t border-slate-100", preview?.part.id === l.part.id && "bg-slate-50")}
                      onClick={() => setPreviewId(l.part.id)}
                    >
                      <td className={cn(tdCls, "font-mono font-medium")}>{l.part.partNumber}</td>
                      <td className="px-3 py-2">{l.part.name}</td>
                      <td className={tdCls}>{l.part.bin ?? <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-1.5">
                        <NumberInput
                          min={1}
                          max={MAX_COPIES}
                          aria-label={`Copies of ${l.part.partNumber}`}
                          className={cn(inputCls, "h-8 w-20", copiesOf(l) < 1 && "border-red-400")}
                          value={l.copies}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setLines((cur) => cur.map((x) => (x.part.id === l.part.id ? { ...x, copies: e.target.value } : x)))}
                        />
                      </td>
                      <td className={cn(tdCls, "text-right")}>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${l.part.partNumber}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLines((cur) => cur.filter((x) => x.part.id !== l.part.id));
                          }}
                        >
                          <X className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" className="gap-1.5" onClick={() => setLines([])}>
                <Trash2 className="size-4" /> Clear
              </Button>
              <Button className="gap-1.5" disabled={invalid || total < 1 || print.isPending} onClick={submit}>
                <Printer className="size-4" /> {print.isPending ? "Sending…" : `Print ${total} label${total === 1 ? "" : "s"}`}
              </Button>
            </div>
          </>
        )}
      </div>

      {ready && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="mb-3 text-sm font-semibold text-slate-700">Recent prints</p>
          {!jobs.data?.length ? (
            <p className="text-sm text-slate-500">{jobs.isLoading ? "Loading…" : "Nothing printed yet at this branch."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={thCls}>Sent</th>
                    <th className={thCls}>Parts</th>
                    <th className={thCls}>Labels</th>
                    <th className={thCls}>By</th>
                    <th className={thCls}>Status</th>
                    <th className={thCls}>Printed on</th>
                    <th className={thCls} />
                  </tr>
                </thead>
                <tbody>
                  {jobs.data.map((j) => (
                    <tr key={j.id} className="border-t border-slate-100 align-top">
                      <td className={cn(tdCls, "text-slate-500")}>{fmtDateTime(j.createdAt)}</td>
                      <td className="px-3 py-2">
                        <span className="font-mono">{j.labels[0]?.partNumber}</span>
                        {j.labels.length > 1 && <span className="text-slate-500"> and {j.labels.length - 1} more</span>}
                      </td>
                      <td className={tdCls}>{j.labelCount}</td>
                      <td className={tdCls}>{j.requestedBy ? `${j.requestedBy.firstName} ${j.requestedBy.lastName}` : "—"}</td>
                      <td className="px-3 py-2">
                        <JobStatusBadge status={j.status} />
                        {j.error && <p className="mt-1 max-w-80 whitespace-normal text-sm text-red-600">{j.error}</p>}
                      </td>
                      <td className={tdCls}>{j.printedStation ? `${j.printedStation.name}, ${fmtDateTime(j.printedAt)}` : "—"}</td>
                      <td className={cn(tdCls, "text-right")}>
                        {(j.status === "FAILED" || j.status === "CANCELLED") && (
                          <Button size="sm" variant="outline" className="gap-1.5" disabled={retry.isPending} onClick={() => retry.mutate(j.id)}>
                            <RotateCcw className="size-4" /> Print again
                          </Button>
                        )}
                        {j.status === "QUEUED" && (
                          <Button size="sm" variant="outline" className="text-red-600" disabled={cancel.isPending} onClick={() => cancel.mutate(j.id)}>
                            Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
