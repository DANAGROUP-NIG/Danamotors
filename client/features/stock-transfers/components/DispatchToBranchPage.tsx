"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { PageHeader } from "@/components/headers/page-header";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { isCpd } from "@/features/mobis-receipts/lib/mobis-labels";
import { useIndents } from "../hooks/use-indents";
import { useIndentAbilities } from "../hooks/use-indent-abilities";
import { useDispatchStn } from "../hooks/use-stns";
import { DEFAULT_DESPATCH, StnDespatchFields, despatchPayload } from "./StnDespatchFields";
import { fmtDate, personName } from "../lib/indent-status";

/**
 * Legacy Pick List for STN "Fill Orders": tick the picked indents of one branch and ship them on a single STN,
 * with one case and one gate pass for the trip.
 */
export function DispatchToBranchPage() {
  const router = useRouter();
  const branches = useBranchStore((s) => s.branches).filter((b) => b.isActive !== false);
  const { user } = useAuth();
  const { crossBranch } = useIndentAbilities();
  const dispatch = useDispatchStn();
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [requestingBranchId, setRequestingBranchId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [despatch, setDespatch] = useState(DEFAULT_DESPATCH);
  const [remarks, setRemarks] = useState("");

  // Stock usually leaves CPD; default to it, else to the user's own branch.
  useEffect(() => {
    if (sourceBranchId || branches.length === 0) return;
    setSourceBranchId(crossBranch ? (branches.find(isCpd)?.id ?? user?.branchId ?? "") : (user?.branchId ?? ""));
  }, [branches, sourceBranchId, crossBranch, user?.branchId]);

  const ready = !!sourceBranchId && !!requestingBranchId;
  const { data, isLoading } = useIndents({ status: "PICKED", sourceBranchId, requestingBranchId, limit: 100 }, ready);
  const indents = ready ? (data?.items ?? []) : [];

  useEffect(() => setSelected(indents.map((i) => i.id)), [data, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit() {
    dispatch.mutate(
      { indentIds: selected, remarks: remarks.trim() || undefined, ...despatchPayload(despatch) },
      { onSuccess: (stn) => router.push(`/transfers/stn/${stn.id}`) },
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <Link href="/transfers/stn" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to STNs
      </Link>
      <PageHeader
        title="Dispatch to branch"
        description="Ship every picked indent for one branch on a single STN, with one gate pass for the trip."
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From (supplying branch)">
            <select
              className={inputCls}
              value={sourceBranchId}
              disabled={!crossBranch}
              onChange={(e) => setSourceBranchId(e.target.value)}
            >
              <option value="">Select branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To (receiving branch)">
            <select className={inputCls} value={requestingBranchId} onChange={(e) => setRequestingBranchId(e.target.value)}>
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
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="mb-4 text-sm font-semibold text-slate-700">Picked indents ready to ship</p>
        {!ready ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-muted-foreground">
            Choose both branches to see their picked indents.
          </p>
        ) : isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-slate-400" />
          </div>
        ) : indents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-muted-foreground">
            No picked indents are waiting for this branch. Approve or pick indents first.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {indents.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={selected.includes(i.id)}
                  onChange={(e) =>
                    setSelected((prev) => (e.target.checked ? [...prev, i.id] : prev.filter((x) => x !== i.id)))
                  }
                  aria-label={`Ship indent ${i.indentNumber}`}
                />
                <Link href={`/transfers/indents/${i.id}`} className="font-mono font-medium hover:underline">
                  {i.indentNumber}
                </Link>
                <span className="text-slate-500">
                  {i._count.lines} line(s) · {fmtDate(i.orderDate)} · {personName(i.requestedBy)}
                  {i.stns.length ? ` · ${i.stns.length} earlier STN(s)` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Everything picked on the ticked indents ships in one case. To ship less than picked or split cases, dispatch an
          indent on its own from its page.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <StnDespatchFields value={despatch} onChange={setDespatch} />
        <div className="mt-4">
          <Field label="Remarks (optional)">
            <input className={inputCls} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="flex justify-end">
        <Button disabled={!selected.length || dispatch.isPending} onClick={submit}>
          {dispatch.isPending ? "Dispatching…" : `Dispatch ${selected.length} indent(s) on one STN`}
        </Button>
      </div>
    </div>
  );
}
