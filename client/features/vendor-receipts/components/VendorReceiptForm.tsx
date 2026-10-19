"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranchStore } from "@/store/branch.store";
import { useFetchBranches } from "@/features/branches/hooks/useFetchBranches";
import { fmtNaira } from "@/features/mobis-receipts/lib/mobis-labels";
import { useCreateVendorReceipt, useReceivableParts, useVendorSearch } from "../hooks/use-vendor-receipts";
import type { ReceivablePart, Vendor } from "../types/vendor-receipt.types";

type Line = { part: ReceivablePart; quantity: number; unitCost: number };

const today = () => new Date().toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

function useDebounced(value: string, ms = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function VendorPicker({ value, onChange }: { value: Vendor | null; onChange: (vendor: Vendor | null) => void }) {
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

function PartSearch({ branchId, exclude, onAdd }: { branchId: string; exclude: string[]; onAdd: (part: ReceivablePart) => void }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const query = useReceivableParts(branchId, debounced);
  return (
    <div className="grid gap-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <input
          className={`${inputCls} pl-9`}
          value={search}
          placeholder={branchId ? "Part number or name (at least 2 characters)" : "Choose the branch first"}
          disabled={!branchId}
          aria-label="Search parts to receive"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {debounced.length >= 2 &&
        (query.isFetching ? (
          <p role="status" className="text-xs text-muted-foreground">Searching parts...</p>
        ) : query.isError ? (
          <p role="alert" className="text-xs text-destructive">Part search failed.</p>
        ) : !query.data?.length ? (
          <p className="text-xs text-muted-foreground">No active parts match. Add the local, used or repaired record on the part&apos;s page first.</p>
        ) : (
          <ul className="max-h-56 overflow-y-auto rounded-md border" aria-label="Matching parts">
            {query.data.map((part) => (
              <li key={part.id}>
                <button
                  type="button"
                  disabled={exclude.includes(part.id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b px-3 py-2 text-left last:border-0 hover:bg-muted/50 disabled:opacity-50"
                  onClick={() => {
                    onAdd(part);
                    setSearch("");
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      <span className="font-mono">{part.partNumber}</span> · {part.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {part.sourceLabel}
                      {part.sourceOfPart ? ` of ${part.sourceOfPart.partNumber}` : ""} · Dealer {fmtNaira(part.unitPrice)}
                      {part.bin ? ` · Bin ${part.bin}` : ""}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{part.stock} in stock</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

/** Posts one vendor invoice to branch stock. Each line is a part record and its unit cost. */
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
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const create = useCreateVendorReceipt();

  // Default to the branch being worked in, else the user's own branch.
  useEffect(() => {
    if (branchId) return;
    const initial = activeBranch?.id ?? user?.branchId ?? "";
    if (initial) setBranchId(initial);
  }, [activeBranch?.id, user?.branchId, branchId]);

  const total = round2(lines.reduce((sum, line) => sum + round2(line.quantity * line.unitCost), 0));
  const errors: string[] = [];
  if (!branchId) errors.push("Choose the receiving branch");
  if (!vendor) errors.push("Choose the vendor");
  if (!invoiceNumber.trim()) errors.push("Enter the vendor invoice number");
  if (!invoiceDate) errors.push("Enter the vendor invoice date");
  if (!lines.length) errors.push("Add at least one part");
  if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) errors.push("Quantities must be whole numbers above zero");
  if (lines.some((l) => !(l.unitCost > 0))) errors.push("Unit costs must be above zero");

  const setLine = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  function submit() {
    if (errors.length || !vendor) return;
    create.mutate(
      {
        receivingBranchId: branchId,
        vendorId: vendor.id,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        remarks: remarks.trim() || undefined,
        lines: lines.map((line) => ({ partId: line.part.id, quantity: line.quantity, unitCost: line.unitCost })),
      },
      { onSuccess: (receipt) => router.push(`/inventory/vendor-receipts/${receipt.id}`) },
    );
  }

  return (
    <div className="grid gap-5 px-4 py-6 lg:px-6">
      <Link href="/inventory/vendor-receipts" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to vendor receipts
      </Link>
      <div className="grid gap-4 rounded-xl border bg-white p-5">
        <h1 className="text-lg font-semibold">New vendor receipt</h1>
        <p className="text-sm text-muted-foreground">
          For local, second-hand and repaired parts, and CPD purchases from vendors other than Mobis. Posting adds the stock
          to the branch, sets each part&apos;s dealer rate to the unit cost and recalculates its retail rate from its price
          category. Mobis invoices go through MIT.
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
            <VendorPicker value={vendor} onChange={setVendor} />
          </Field>
          <Field label="Vendor invoice number">
            <input className={inputCls} maxLength={40} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </Field>
          <Field label="Vendor invoice date">
            <input type="date" className={inputCls} value={invoiceDate} max={today()} onChange={(e) => setInvoiceDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Remarks (optional)">
          <input className={inputCls} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-3 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Parts received</h2>
        <PartSearch
          branchId={branchId}
          exclude={lines.map((l) => l.part.id)}
          onAdd={(part) => setLines((current) => [...current, { part, quantity: 1, unitCost: part.unitPrice }])}
        />
        {lines.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-2">Part</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Unit cost (₦)</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.part.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <span className="font-mono font-medium">{line.part.partNumber}</span>
                      <span className="block text-xs text-muted-foreground">{line.part.name}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{line.part.sourceLabel}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        aria-label={`Quantity of ${line.part.partNumber}`}
                        className={`${inputCls} h-8 w-20`}
                        value={line.quantity}
                        onChange={(e) => setLine(index, { quantity: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        aria-label={`Unit cost of ${line.part.partNumber}`}
                        className={`${inputCls} h-8 w-32`}
                        value={line.unitCost}
                        onChange={(e) => setLine(index, { unitCost: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(round2(line.quantity * line.unitCost))}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        aria-label={`Remove ${line.part.partNumber}`}
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                        onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={4} className="px-3 py-2 text-right font-semibold">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtNaira(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {errors.length > 0 && lines.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <div>
        <Button type="button" disabled={errors.length > 0 || create.isPending} onClick={submit}>
          {create.isPending ? "Posting…" : "Post receipt (MRN)"}
        </Button>
      </div>
    </div>
  );
}
