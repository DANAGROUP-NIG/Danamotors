"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { PageHeader } from "@/components/headers/page-header";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { isCpd } from "@/features/mobis-receipts/lib/mobis-labels";
import { PartPicker } from "./PartPicker";
import { DEFAULT_DESPATCH, StnDespatchFields, despatchPayload } from "./StnDespatchFields";
import { useIndentAbilities } from "../hooks/use-indent-abilities";
import { useDirectStn } from "../hooks/use-stns";
import { fmtCurrency } from "../lib/indent-status";
import type { PartSearchResult } from "../types/indent.types";

const toInt = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/** Legacy STN with no indent behind it, e.g. the monthly Microcat Live recharge to each branch. */
export function DirectStnForm() {
  const router = useRouter();
  const branches = useBranchStore((s) => s.branches).filter((b) => b.isActive !== false);
  const { user } = useAuth();
  const { crossBranch } = useIndentAbilities();
  const send = useDirectStn();
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<{ part: PartSearchResult; quantity: string }[]>([]);
  const [despatch, setDespatch] = useState(DEFAULT_DESPATCH);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sourceBranchId || branches.length === 0) return;
    setSourceBranchId(crossBranch ? (branches.find(isCpd)?.id ?? user?.branchId ?? "") : (user?.branchId ?? ""));
  }, [branches, sourceBranchId, crossBranch, user?.branchId]);

  const total = lines.reduce((s, l) => s + toInt(l.quantity) * l.part.unitRate, 0);

  function submit() {
    setError("");
    if (!sourceBranchId || !destinationBranchId) return setError("Choose both branches.");
    if (remarks.trim().length < 3) return setError("Say what this STN is for, for example Microcat Live for May.");
    if (!lines.length) return setError("Add at least one part.");
    const bad = lines.find((l) => !toInt(l.quantity) || toInt(l.quantity) > l.part.sourceAvailable);
    if (bad) return setError(`${bad.part.partNumber}: enter a quantity from 1 to ${bad.part.sourceAvailable} (free stock).`);
    send.mutate(
      {
        sourceBranchId,
        destinationBranchId,
        remarks: remarks.trim(),
        ...despatchPayload(despatch),
        lines: lines.map((l) => ({ partId: l.part.id, quantity: toInt(l.quantity) })),
      },
      { onSuccess: (stn) => router.push(`/transfers/stn/${stn.id}`) },
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <Link href="/transfers/stn" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to STNs
      </Link>
      <PageHeader
        title="Direct STN"
        description="Send free stock to a branch without an indent. The branch is notified and receives it with an MRN."
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="From">
            <select className={inputCls} value={sourceBranchId} disabled={!crossBranch || lines.length > 0} onChange={(e) => setSourceBranchId(e.target.value)}>
              <option value="">Select branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To">
            <select className={inputCls} value={destinationBranchId} onChange={(e) => setDestinationBranchId(e.target.value)}>
              <option value="">Select branch</option>
              {branches
                .filter((b) => b.id !== sourceBranchId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Purpose">
            <input
              className={inputCls}
              maxLength={500}
              placeholder="e.g. Microcat Live for the month of May"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Package className="size-4" /> Parts
          </div>
          <div className="w-full sm:w-96">
            <PartPicker
              sourceBranchId={sourceBranchId || undefined}
              disabled={!sourceBranchId}
              placeholder={sourceBranchId ? "Add a part: search number or name…" : "Choose the sending branch first…"}
              onSelect={(part) =>
                setLines((prev) => (prev.some((l) => l.part.id === part.id) ? prev : [...prev, { part, quantity: "1" }]))
              }
              renderMeta={(part) => (
                <span className={cn("block font-medium", part.sourceAvailable > 0 ? "text-emerald-700" : "text-red-600")}>
                  {part.sourceAvailable} free
                </span>
              )}
            />
          </div>
        </div>
        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-muted-foreground">
            No parts yet. Search above to add the first one.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-sm font-medium uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Part</th>
                <th className="px-3 py-2 text-right">Free</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Dealer rate</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.part.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <p className="font-mono font-medium">{l.part.partNumber}</p>
                    <p className="text-slate-500">{l.part.name}</p>
                  </td>
                  <td className="px-3 py-2 text-right">{l.part.sourceAvailable}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={1}
                      className={cn(inputCls, "ml-auto h-9 w-24 text-right", toInt(l.quantity) > l.part.sourceAvailable && "border-red-400")}
                      value={l.quantity}
                      onChange={(e) =>
                        setLines((prev) => prev.map((x) => (x.part.id === l.part.id ? { ...x, quantity: e.target.value } : x)))
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right">{fmtCurrency(l.part.unitRate)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove line"
                      onClick={() => setLines((prev) => prev.filter((x) => x.part.id !== l.part.id))}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <StnDespatchFields value={despatch} onChange={setDespatch} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {lines.length} part(s) · <span className="font-semibold text-slate-800">{fmtCurrency(total)}</span> at dealer rate
        </p>
        <div className="flex flex-col items-end gap-2">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button disabled={send.isPending} onClick={submit}>
            {send.isPending ? "Sending…" : "Dispatch direct STN"}
          </Button>
        </div>
      </div>
    </div>
  );
}
