"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import { Field, inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useFetchBranches } from "@/features/branches/hooks/useFetchBranches";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { parseMitFile, type ParsedMitFile } from "../lib/parse-mit";
import { matchPartsRequest } from "../api/mobis.api";
import { useImportMit } from "../hooks/use-mobis";
import { DEFAULT_CONVERSION_RATE, RECEIVED_MODE_LABELS, fmtNaira, fmtPrice, isCpd } from "../lib/mobis-labels";
import type { PartMatch, ReceivedMode } from "../types/mobis.types";

const thCls = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";
const today = () => new Date().toISOString().slice(0, 10);

/** Legacy Part Purchase > MIT > Add, with the invoice file read in the browser and previewed before saving. */
export function MitUploadPage() {
  const router = useRouter();
  const importMit = useImportMit();
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  useFetchBranches();
  const branches = useBranchStore((s) => s.branches);

  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedMitFile | null>(null);
  const [parseError, setParseError] = useState("");
  const [reading, setReading] = useState(false);
  const [matches, setMatches] = useState<PartMatch[] | null>(null);
  const [matchFailed, setMatchFailed] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [conversionRate, setConversionRate] = useState(String(DEFAULT_CONVERSION_RATE));
  const [physicalReceiptDate, setPhysicalReceiptDate] = useState(today());
  const [receivedMode, setReceivedMode] = useState<ReceivedMode | "">("");
  const [branchId, setBranchId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [createMissing, setCreateMissing] = useState(true);

  // Mobis stock is received at CPD; default to it, else to the user's own branch.
  useEffect(() => {
    if (branchId || branches.length === 0) return;
    setBranchId(branches.find(isCpd)?.id ?? user?.branchId ?? "");
  }, [branches, branchId, user?.branchId]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setParseError("");
    setParsed(null);
    setMatches(null);
    setMatchFailed(false);
    setFileName(file.name);
    try {
      const result = await parseMitFile(file);
      setParsed(result);
      setInvoiceNumber(result.invoiceNumber);
      try {
        setMatches(await matchPartsRequest(result.lines.map((l) => l.partNumber)));
      } catch {
        // The server still checks every part on save; the preview just cannot mark new parts.
        setMatchFailed(true);
        setMatches([]);
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "The file could not be read.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearFile() {
    setParsed(null);
    setMatches(null);
    setFileName("");
    setParseError("");
    setInvoiceNumber("");
  }

  const matchByNumber = useMemo(() => new Map((matches ?? []).map((m) => [m.partNumber, m.part])), [matches]);
  const newParts = matchFailed ? 0 : (matches ?? []).filter((m) => !m.part).length;
  const rate = Number(conversionRate);
  const totals = useMemo(() => {
    const lines = parsed?.lines ?? [];
    return {
      qty: lines.reduce((s, l) => s + l.quantity, 0),
      amount: lines.reduce((s, l) => s + l.amount, 0),
      cases: new Set(lines.map((l) => l.caseNumber).filter(Boolean)).size,
    };
  }, [parsed]);

  const errors: string[] = [];
  if (!parsed) errors.push("Choose the Mobis invoice file");
  if (!invoiceNumber.trim()) errors.push("Enter the invoice number");
  if (!(rate > 0)) errors.push("Enter a conversion rate above zero");
  if (!receivedMode) errors.push("Choose the received mode");
  if (!branchId) errors.push("Choose the receiving branch");
  if (newParts > 0 && !createMissing) errors.push(`${newParts} part(s) are not in Part Master`);

  function save() {
    if (!parsed || errors.length) return;
    importMit.mutate(
      {
        destinationBranchId: branchId,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: invoiceDate || undefined,
        conversionRate: rate,
        physicalReceiptDate: physicalReceiptDate || undefined,
        receivedMode: receivedMode as ReceivedMode,
        remarks: remarks.trim() || undefined,
        sourceFileName: fileName,
        createMissingParts: createMissing,
        lines: parsed.lines.map((l) => ({
          orderNumber: l.orderNumber || undefined,
          lineNumber: l.lineNumber || undefined,
          partNumber: l.partNumber,
          partName: l.partName || undefined,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          amount: l.amount,
          caseNumber: l.caseNumber || undefined,
          intRef: l.intRef || undefined,
          weight: l.weight ?? undefined,
          hsCode: l.hsCode || undefined,
        })),
      },
      { onSuccess: (mit) => router.push(`/inventory/mobis-receipts/${mit.id}`) },
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <Link href="/inventory/mobis-receipts" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Mobis Receipts
      </Link>
      <PageHeader title="Upload MIT" description="Import a Mobis invoice file in MIT format. Nothing is saved until you click Save." />

      {/* ── File ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <input
          ref={fileRef}
          type="file"
          accept=".xls,.xlsx,.csv,.txt,.tsv"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {!fileName ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 py-10 text-sm text-slate-500 hover:border-primary hover:text-primary"
          >
            <Upload className="size-6" />
            <span className="font-medium">Choose the Mobis invoice file</span>
            <span className="text-xs">.xls, .xlsx, .csv or tab-separated text in MIT format</span>
          </button>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              {reading ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4 text-emerald-600" />}
              <span className="font-medium">{fileName}</span>
              {parsed && (
                <span className="text-slate-500">
                  · {parsed.lines.length} line(s), {totals.qty} unit(s), {totals.cases} case(s)
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                Choose another file
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={clearFile} aria-label="Remove file">
                <X className="size-4" />
              </Button>
            </div>
          </div>
        )}
        {parseError && <p className="mt-3 text-sm text-red-600">{parseError}</p>}
        {parsed && parsed.problems.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4" /> {parsed.problems.length} row(s) could not be read and will be left out:
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {parsed.problems.slice(0, 8).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Header ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Vendor">
            <input className={inputCls} value="Mobis" readOnly />
          </Field>
          <Field label="Invoice no.">
            <input className={cn(inputCls, "font-mono")} value={invoiceNumber} maxLength={40} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </Field>
          <Field label="Invoice date (optional)">
            <input type="date" className={inputCls} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </Field>
          <Field label="Conversion rate">
            <input type="number" min={0} step="0.01" className={inputCls} value={conversionRate} onChange={(e) => setConversionRate(e.target.value)} />
          </Field>
          <Field label="Material physical receipt date">
            <input type="date" className={inputCls} value={physicalReceiptDate} onChange={(e) => setPhysicalReceiptDate(e.target.value)} />
          </Field>
          <Field label="Received mode">
            <select className={inputCls} value={receivedMode} onChange={(e) => setReceivedMode(e.target.value as ReceivedMode)}>
              <option value="">Choose</option>
              {Object.entries(RECEIVED_MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Receiving branch">
            <select className={inputCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Choose</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Remarks (optional)">
            <input className={inputCls} value={remarks} maxLength={500} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>
      </div>

      {/* ── Preview ── */}
      {parsed && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700">Invoice lines</p>
            <p className="text-sm text-slate-600">
              Total {fmtPrice(totals.amount)}
              {rate > 0 && <span className="text-slate-400"> · {fmtNaira(totals.amount * rate)} at {rate}</span>}
            </p>
          </div>
          {newParts > 0 && (
            <label className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <input type="checkbox" className="mt-0.5" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
              <span>
                Create the {newParts} new part(s) in Part Master from this invoice. They get the invoice part name and a dealer
                rate of unit price × conversion rate; complete their category and other details in Part Master later.
              </span>
            </label>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>Order no.</th>
                  <th className={thCls}>L / I</th>
                  <th className={thCls}>Part no.</th>
                  <th className={thCls}>Part name</th>
                  <th className={cn(thCls, "text-right")}>Qty</th>
                  <th className={cn(thCls, "text-right")}>Unit price</th>
                  <th className={cn(thCls, "text-right")}>Amount</th>
                  <th className={thCls}>Case no.</th>
                  <th className={thCls}>Weight</th>
                  <th className={thCls}>HS code</th>
                  <th className={thCls}>Part Master</th>
                </tr>
              </thead>
              <tbody>
                {parsed.lines.map((l) => {
                  const known = matchByNumber.get(l.partNumber);
                  return (
                    <tr key={l.row} className="border-t border-slate-100">
                      <td className={cn(tdCls, "font-mono text-xs")}>{l.orderNumber}</td>
                      <td className={cn(tdCls, "font-mono text-xs")}>{l.lineNumber}</td>
                      <td className={cn(tdCls, "font-mono text-xs font-medium")}>{l.partNumber}</td>
                      <td className={cn(tdCls, "max-w-64 truncate")}>{l.partName}</td>
                      <td className={cn(tdCls, "text-right")}>{l.quantity}</td>
                      <td className={cn(tdCls, "text-right")}>{fmtPrice(l.unitPrice)}</td>
                      <td className={cn(tdCls, "text-right")}>{fmtPrice(l.amount)}</td>
                      <td className={cn(tdCls, "font-mono text-xs")}>{l.caseNumber}</td>
                      <td className={tdCls}>{l.weight ?? ""}</td>
                      <td className={tdCls}>{l.hsCode}</td>
                      <td className={tdCls}>
                        {matchFailed ? (
                          <span className="text-xs text-slate-400">Not checked</span>
                        ) : matches === null ? (
                          <Loader2 className="size-3.5 animate-spin text-slate-400" />
                        ) : known ? (
                          <span className={cn("text-xs", known.partStatus === "BLOCKED" ? "text-red-600" : "text-emerald-700")}>
                            {known.partStatus === "BLOCKED" ? "Exists (blocked)" : "Exists"}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-blue-700">New part</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Save ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-500">{errors.length ? errors.join(" · ") : "Ready to save. The MIT will then be checked and posted with an MRN."}</p>
        <Button type="button" disabled={errors.length > 0 || importMit.isPending || reading} onClick={save} className="gap-1.5">
          {importMit.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Save MIT
        </Button>
      </div>
    </div>
  );
}
