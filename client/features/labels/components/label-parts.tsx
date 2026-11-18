"use client";

import { Printer } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/table-components/StatusBadge";
import { cn } from "@/lib/utils";
import { bestPrinter } from "../hooks/use-labels";
import type { LabelPrinter, LabelPrintStatus, PrinterStatus } from "../types/labels.types";

export const JOB_STATUS: Record<LabelPrintStatus, { label: string; tone: StatusTone }> = {
  QUEUED: { label: "Waiting", tone: "amber" },
  PRINTED: { label: "Printed", tone: "emerald" },
  FAILED: { label: "Failed", tone: "red" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};

const PRINTER_STATUS: Record<PrinterStatus, string> = {
  READY: "Ready",
  PAUSED: "Paused: press the pause button on the printer",
  PAPER_OUT: "Out of labels: load a new roll",
  HEAD_OPEN: "Print head open: close it",
  ERROR: "Error",
};

/** One line on the branch's label printer: where it is and whether it can print now. */
export function PrinterLine({ printers, loading }: { printers?: LabelPrinter[]; loading?: boolean }) {
  const printer = bestPrinter(printers);
  const ready = printer?.printerStatus === "READY";
  let text: string;
  if (loading) text = "Looking for the label printer…";
  else if (!printers?.length) text = "No station PC is registered at this branch (Settings > HHDC). Labels wait until one with a printer is.";
  else if (!printer) text = "No label printer is online at this branch: check the station PC is on and the printer is plugged into it. Labels wait until it is.";
  else
    text = `${printer.printerModel} on ${printer.name}: ${PRINTER_STATUS[printer.printerStatus ?? "ERROR"]}${
      printer.printerDetail && printer.printerStatus !== "READY" ? ` (${printer.printerDetail})` : ""
    }`;
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        loading ? "border-slate-200 text-slate-500" : ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      <Printer className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

export function JobStatusBadge({ status }: { status: LabelPrintStatus }) {
  return <StatusBadge status={JOB_STATUS[status].label} tone={JOB_STATUS[status].tone} />;
}

/**
 * The 2" x 2" label as it prints (labels.zpl.ts on the server): description, part number, barcode, bin.
 * The bars here only suggest the barcode; the printer draws the real Code 128.
 */
export function LabelPreview({ partNumber, description, bin, store }: { partNumber: string; description: string; bin: string | null; store: string }) {
  return (
    <div className="aspect-square w-48 shrink-0 rounded-md border border-slate-300 bg-white p-2.5 font-sans text-slate-900 shadow-sm" aria-label="Label preview">
      <div className="flex justify-between text-[9px] font-semibold">
        <span>DANA MOTORS</span>
        <span>{store}</span>
      </div>
      <div className="my-1 border-t-2 border-slate-900" />
      <p className="line-clamp-2 h-6 text-[9px] font-semibold uppercase leading-tight">{description}</p>
      <p className="mt-1 truncate text-center text-[15px] font-bold leading-tight">{partNumber}</p>
      <div
        className="mx-auto mt-1 h-9 w-[85%]"
        style={{ backgroundImage: "repeating-linear-gradient(90deg,#0f172a 0 2px,transparent 2px 3px,#0f172a 3px 4px,transparent 4px 7px,#0f172a 7px 10px,transparent 10px 11px)" }}
      />
      <p className="mt-1.5 h-4 truncate text-[11px] font-semibold">{bin ? `BIN ${bin}` : ""}</p>
      <div className="mt-1 border-t border-slate-400" />
    </div>
  );
}
