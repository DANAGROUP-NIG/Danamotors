"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { NumberInput } from "@/components/forms/NumberInput";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranchStore } from "@/store/branch.store";
import { useFetchBranches } from "@/features/branches/hooks/useFetchBranches";
import { mobisErrorMessage } from "@/features/mobis-receipts/hooks/use-mobis";
import { errorStatus, useCreateVendorReceipt, useMrnSettings, useVendorSearch } from "../hooks/use-vendor-receipts";
import type { MrnTaxForm, Vendor } from "../types/vendor-receipt.types";
import { EditorLine, ReceiptLinesEditor, TaxFormSelect, useDebounced } from "./ReceiptLinesEditor";

const today = () => new Date().toISOString().slice(0, 10);

export function VendorPicker({ value, onChange }: { value: Vendor | null; onChange: (vendor: Vendor | null) => void }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const query = useVendorSearch(debounced);
  if (value)
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span>
          {value.name}
          {value.code && <span className="ml-2 font-mono text-xs text-muted-foreground">{value.code}</span>}
        </span>
        <button type="button" aria-label="Change vendor" className="rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={() => onChange(null)}>
          <X className="size-4" />
        </button>
      </div>
    );
  return (
    <div className="grid gap-1">
      <input className={inputCls} value={search} placeholder="Search vendors by name or code" aria-label="Search vendors" onChange={(e) => setSearch(e.target.value)} />
      {query.isError ? (
        <p role="alert" className="text-xs text-destructive">Vendor search failed.</p>
      ) : query.data && query.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No vendors found. Add the vendor as a party of type VENDOR first.</p>
      ) : (
        <ul className="max-h-40 overflow-y-auto rounded-md border" aria-label="Vendors">
          {query.data?.map((vendor) => (
            <li key={vendor.id}>
              <button type="button" className="w-full border-b px-3 py-1.5 text-left text-sm last:border-0 hover:bg-muted/50" onClick={() => onChange(vendor)}>
                {vendor.name}
                {vendor.code && <span className="ml-2 font-mono text-xs text-muted-foreground">{vendor.code}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Posts one vendor invoice to branch stock (legacy Material Receipt Note). */
export function VendorReceiptForm() {
  const router = useRouter();
  const { user } = useAuth();
  useFetchBranches();
  const branches = useBranchStore((s) => s.branches);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const [branchId, setBranchId] = useState("");
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [taxForm, setTaxForm] = useState<MrnTaxForm>("Y");
  const [conversionRate, setConversionRate] = useState<number | null>(1);
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<EditorLine[]>([]);
  // Set when the server says this vendor invoice was already received: a reason posts it again.
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [duplicateReason, setDuplicateReason] = useState("");
  const create = useCreateVendorReceipt();
  const settings = useMrnSettings(branchId);

  // Default to the branch being worked in, else the user's own branch.
  useEffect(() => {
    if (branchId) return;
    const initial = activeBranch?.id ?? user?.branchId ?? "";
    if (initial) setBranchId(initial);
  }, [activeBranch?.id, user?.branchId, branchId]);

  function chooseVendor(next: Vendor | null) {
    setVendor(next);
    setDuplicate(null);
    // Legacy MRNs followed the vendor type (imported P, local Y); the store can still change it.
    if (next?.defaultTaxForm) setTaxForm(next.defaultTaxForm);
  }

  const rate = conversionRate ?? 0;
  const errors: string[] = [];
  if (!branchId) errors.push("Choose the receiving branch");
  if (!vendor) errors.push("Choose the vendor");
  if (!invoiceNumber.trim()) errors.push("Enter the vendor invoice number");
  if (!invoiceDate) errors.push("Enter the vendor invoice date");
  if (!(rate > 0)) errors.push("Enter the conversion rate (1 for a naira invoice)");
  if (!lines.length) errors.push("Add at least one part");
  if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) errors.push("Quantities must be whole numbers above zero");
  if (lines.some((l) => !(l.unitPrice > 0))) errors.push("Unit prices must be above zero");
  if (duplicate && duplicateReason.trim().length < 3) errors.push("Give the reason for receiving this invoice again");

  function submit() {
    if (errors.length || !vendor) return;
    create.mutate(
      {
        receivingBranchId: branchId,
        vendorId: vendor.id,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        taxForm,
        conversionRate: rate,
        duplicateReason: duplicate ? duplicateReason.trim() : undefined,
        remarks: remarks.trim() || undefined,
        lines: lines.map((line) => ({ partId: line.part.id, quantity: line.quantity, unitPrice: line.unitPrice })),
      },
      {
        onSuccess: (receipt) => router.push(`/inventory/mrn/${receipt.id}`),
        onError: (error) => {
          if (errorStatus(error) === 409) setDuplicate(mobisErrorMessage(error, "This invoice was already received."));
        },
      },
    );
  }

  return (
    <div className="grid gap-5 px-4 py-6 lg:px-6">
      <Link href="/inventory/mrn" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to MRNs
      </Link>
      <div className="grid gap-4 rounded-xl border bg-white p-5">
        <h1 className="text-lg font-semibold">New vendor receipt</h1>
        <p className="text-sm text-muted-foreground">
          For local, second-hand and repaired parts, and CPD purchases from vendors other than Mobis (Mobis invoices go
          through MIT). Posting adds the stock. Local, used and repaired records take the cost as their dealer rate and
          their retail is recalculated; Mobis parts bought locally keep Finance&apos;s price.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Receiving branch">
            <select className={inputCls} value={branchId} onChange={(e) => { setBranchId(e.target.value); setLines([]); }}>
              <option value="">Choose a branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vendor">
            <VendorPicker value={vendor} onChange={chooseVendor} />
          </Field>
          <Field label="Vendor invoice number">
            <input className={inputCls} maxLength={40} value={invoiceNumber} onChange={(e) => { setInvoiceNumber(e.target.value); setDuplicate(null); }} />
          </Field>
          <Field label="Vendor invoice date">
            <input type="date" className={inputCls} value={invoiceDate} max={today()} onChange={(e) => setInvoiceDate(e.target.value)} />
          </Field>
          <Field label="Tax form">
            <TaxFormSelect value={taxForm} onChange={setTaxForm} />
          </Field>
          <Field label="Conversion rate (1 = naira invoice)">
            <NumberInput min="0.0001" step="any" className={inputCls} value={conversionRate} onValueChange={setConversionRate} aria-label="Conversion rate" />
          </Field>
        </div>
        <Field label="Remarks (optional)">
          <input className={inputCls} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-3 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Parts received</h2>
        <ReceiptLinesEditor
          branchId={branchId}
          lines={lines}
          onChange={setLines}
          taxForm={taxForm}
          conversionRate={rate}
          roundToNaira={!!settings.data?.roundMrnTotal}
        />
      </div>

      {duplicate && (
        <div role="alert" className="grid gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p>{duplicate}</p>
          <Field label="Reason for receiving it again (e.g. second part of the delivery)">
            <input className={inputCls} maxLength={300} value={duplicateReason} onChange={(e) => setDuplicateReason(e.target.value)} />
          </Field>
        </div>
      )}

      {errors.length > 0 && lines.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <div>
        <Button type="button" disabled={errors.length > 0 || create.isPending} onClick={submit}>
          {create.isPending ? "Posting…" : duplicate ? "Receive again (MRN)" : "Post receipt (MRN)"}
        </Button>
      </div>
    </div>
  );
}
