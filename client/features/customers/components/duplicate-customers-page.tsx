"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Merge } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api/apiClient";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";

/** Mirrors duplicateGroups() and the merge-batch route in server customer-merge-extras.ts / customer.routes.ts. */
type Member = {
  id: string; code: string | null; type: string; name: string; phone: string | null; email: string | null;
  branch: string | null; createdAt: string; vehicles: number; jobCards: number; invoices: number;
};
type Group = { key: string; size: number; members: Member[] };
type GroupsResponse = { groups: Group[]; meta: { total: number; page: number; limit: number; totalPages: number } };
type BatchResult = { merged: number; failed: number; results: { sourceId: string; targetId: string; ok: boolean; error?: string }[] };
type By = "phone" | "name" | "company";

const BY: { value: By; label: string }[] = [
  { value: "phone", label: "Same phone" },
  { value: "name", label: "Same name" },
  { value: "company", label: "Same company" },
];

/** The record most worth keeping: the one with the most history, then the oldest. */
function defaultSurvivor(members: Member[]) {
  return [...members].sort((a, b) => (b.vehicles + b.jobCards + b.invoices) - (a.vehicles + a.jobCards + a.invoices) || a.createdAt.localeCompare(b.createdAt))[0]?.id;
}

/**
 * Customers → Duplicate customers. Groups active customers that share a phone, name or company; the user
 * picks the record to keep in each group, ticks the ones to merge into it, and merges them all in one go.
 * Replaces legacy's Customer Correction Utility bulk (XLS) mode. Each merge is logged on the kept customer
 * (Merge history) and keeps the kept customer's own details; to take a duplicate's name or address, merge
 * that pair from the duplicate's page instead.
 */
export function DuplicateCustomersPage() {
  const { isAdminOrAbove } = useAuth();
  const queryClient = useQueryClient();
  const [by, setBy] = useState<By>("phone");
  const [page, setPage] = useState(1);
  const [survivor, setSurvivor] = useState<Record<string, string>>({});
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);

  const query = useQuery({
    queryKey: ["customers", "duplicate-groups", by, page],
    queryFn: () => apiGet<GroupsResponse>(`/customers/duplicate-groups?by=${by}&page=${page}&limit=25`),
    placeholderData: keepPreviousData,
  });
  const groups = useMemo(() => query.data?.groups ?? [], [query.data]);
  const keepOf = (g: Group) => survivor[g.key] ?? defaultSurvivor(g.members);

  const pairs = useMemo(
    () =>
      groups.flatMap((g) => {
        const targetId = survivor[g.key] ?? defaultSurvivor(g.members);
        return g.members.filter((m) => m.id !== targetId && ticked.has(m.id)).map((m) => ({ sourceId: m.id, targetId, source: m, target: g.members.find((x) => x.id === targetId)! }));
      }),
    [groups, survivor, ticked],
  );

  const merge = useMutation({
    mutationFn: () => apiPost<BatchResult>("/customers/merge-batch", { merges: pairs.map(({ sourceId, targetId }) => ({ sourceId, targetId })) }),
    onSuccess: (data) => {
      setResult(data);
      setTicked(new Set());
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      if (data.failed === 0) toast.success(`${data.merged} customer(s) merged`);
      else toast.error(`${data.merged} merged, ${data.failed} failed`);
    },
    onError: () => toast.error("The merge request failed; nothing was merged"),
  });

  function toggle(id: string) {
    setTicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeBy(value: By) {
    setBy(value);
    setPage(1);
    setTicked(new Set());
    setSurvivor({});
  }

  const total = query.data?.meta.total ?? 0;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Duplicate customers"
        description="Customers that share a phone, name or company. Choose the record to keep in each group, tick the duplicates, and merge them in one go."
        actions={
          isAdminOrAbove && (
            <Button size="sm" disabled={pairs.length === 0 || merge.isPending} onClick={() => setConfirming(true)}>
              <Merge className="size-4" /> Merge {pairs.length || ""} ticked
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Group by">
          {BY.map((b) => (
            <button
              key={b.value}
              type="button"
              role="tab"
              aria-selected={by === b.value}
              onClick={() => changeBy(b.value)}
              className={cn("rounded-md px-3 py-1 text-sm font-medium", by === b.value ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >
              {b.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-500">{query.isLoading ? "Looking…" : `${total.toLocaleString()} group(s)`}</span>
      </div>

      {query.isError && <p role="alert" className="text-sm text-red-600">Could not load duplicates.</p>}
      {!query.isLoading && groups.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No likely duplicates found this way.</p>}

      <div className={cn("grid gap-4", query.isFetching && "opacity-70")}>
        {groups.map((g) => {
          const keepId = keepOf(g);
          return (
            <section key={g.key} className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                <span className="text-sm font-semibold text-slate-700">
                  {by === "phone" ? `Phone ending ${g.key}` : g.key} <span className="font-normal text-slate-500">· {g.size} records</span>
                </span>
              </header>
              <table className="w-full text-sm">
                <thead className="bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Keep</th>
                    <th className="px-2 py-2 font-medium">Merge</th>
                    <th className="px-2 py-2 font-medium">Customer</th>
                    <th className="px-2 py-2 font-medium">Phone / email</th>
                    <th className="px-2 py-2 font-medium">Branch</th>
                    <th className="px-2 py-2 font-medium">Created</th>
                    <th className="px-2 py-2 text-right font-medium">Vehicles</th>
                    <th className="px-2 py-2 text-right font-medium">Jobs</th>
                    <th className="px-4 py-2 text-right font-medium">Bills</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {g.members.map((m) => {
                    const isKeep = m.id === keepId;
                    return (
                      <tr key={m.id} className={cn(isKeep && "bg-emerald-50/50", ticked.has(m.id) && !isKeep && "bg-amber-50/50")}>
                        <td className="px-4 py-2">
                          <input
                            type="radio"
                            name={`keep-${g.key}`}
                            aria-label={`Keep ${m.name}`}
                            checked={isKeep}
                            disabled={!isAdminOrAbove}
                            onChange={() => {
                              setSurvivor((s) => ({ ...s, [g.key]: m.id }));
                              setTicked((s) => { const next = new Set(s); next.delete(m.id); return next; });
                            }}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            aria-label={`Merge ${m.name} into the kept record`}
                            checked={!isKeep && ticked.has(m.id)}
                            disabled={!isAdminOrAbove || isKeep}
                            onChange={() => toggle(m.id)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Link href={`/customers/${m.id}`} className="font-medium text-primary hover:underline">{m.name}</Link>
                          <span className="block text-xs text-slate-500">{m.code ?? "No code"} · {m.type === "CORPORATE" ? "Corporate" : "Individual"}</span>
                        </td>
                        <td className="px-2 py-2 text-slate-600">{[m.phone, m.email].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="px-2 py-2 text-slate-600">{m.branch ?? "—"}</td>
                        <td className="px-2 py-2 text-slate-600">{new Date(m.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{m.vehicles}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{m.jobCards}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{m.invoices}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>

      {(query.data?.meta.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span>Page {page} of {query.data?.meta.totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= (query.data?.meta.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <ModalFame isOpen={confirming} onClose={() => { setConfirming(false); setResult(null); }} title="Merge duplicate customers" size="wide" preventAccidentalClose={merge.isPending}>
        {result ? (
          <div className="grid gap-3 text-sm">
            <p>{result.merged} merged{result.failed ? `, ${result.failed} failed` : ""}.</p>
            {result.results.filter((r) => !r.ok).map((r) => (
              <p key={r.sourceId} className="text-red-600">{r.error}</p>
            ))}
            <Button onClick={() => { setConfirming(false); setResult(null); }}>Close</Button>
          </div>
        ) : (
          <div className="grid gap-3 text-sm">
            <p>Each duplicate&apos;s vehicles, jobs, bills, receipts and credit move to the kept customer, which keeps its own name, phone, email and address. The duplicates stay, read-only, for audit.</p>
            <ul className="max-h-72 overflow-y-auto rounded-md border border-slate-200 p-2">
              {pairs.map((p) => (
                <li key={p.sourceId} className="py-0.5">
                  <span className="font-medium">{p.source.name}</span> {p.source.code && <span className="text-slate-500">({p.source.code})</span>} → {p.target.name} {p.target.code && <span className="text-slate-500">({p.target.code})</span>}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button disabled={merge.isPending} onClick={() => merge.mutate()}>{merge.isPending ? "Merging…" : `Merge ${pairs.length}`}</Button>
              <Button variant="outline" disabled={merge.isPending} onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </ModalFame>
    </div>
  );
}
