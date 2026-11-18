"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Lock, LockOpen } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable } from "@/components/ui/table-components/DataTable";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { apiGet, apiPut } from "@/lib/api/apiClient";
import { useAuth } from "@/features/auth/hooks/use-auth";

/** Mirrors server/src/modules/books-closed (mounted at /books-closed). */
type BranchRow = { branchId: string; code: string; name: string; isActive: boolean; closedUpTo: string | null; effective: string | null };
type BooksClosed = { closedUpTo: string | null; today: string; branches: BranchRow[] };
type Check = { date: string; open: { key: string; label: string; count: number }[] };

export const BOOKS_CLOSE = "books:close";
const KEY = ["books-closed"] as const;

const show = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "Open";

/** The last 31 December before today: the usual date to close the financial year (January–December). */
function lastYearEnd(today: string) {
  const year = Number(today.slice(0, 4)) - 1;
  return `${year}-12-31`;
}

function errorMessage(error: unknown, fallback: string) {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/**
 * Settings → Books closed. Replaces legacy Year End: there is no carry-forward (balances are computed from
 * transactions), only the date up to which nothing may be added, changed, cancelled or deleted.
 */
export function BooksClosedPage() {
  const { hasPermission } = useAuth();
  const canClose = hasPermission(BOOKS_CLOSE);
  const query = useQuery({ queryKey: KEY, queryFn: () => apiGet<BooksClosed>("/books-closed") });
  const [editing, setEditing] = useState<null | { scope: "company" } | { scope: "branch"; branch: BranchRow }>(null);
  const data = query.data;

  return (
    <div className="grid gap-5 p-5">
      <PageHeader
        title="Books closed"
        description="Finance and stock entries dated on or before the closed date cannot be added, changed, cancelled or deleted. The financial year is January–December."
      />

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`inline-grid size-10 place-items-center rounded-full ${data?.closedUpTo ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
              {data?.closedUpTo ? <Lock className="size-5" /> : <LockOpen className="size-5" />}
            </span>
            <div>
              <p className="text-sm text-slate-500">All branches: books closed up to</p>
              <p className="text-xl font-semibold text-slate-800">{query.isLoading ? "…" : show(data?.closedUpTo ?? null)}</p>
            </div>
          </div>
          {canClose && data && (
            <Button onClick={() => setEditing({ scope: "company" })}>Change closed date</Button>
          )}
        </div>
        <ul className="mt-4 grid gap-1 text-sm text-slate-600">
          <li>Blocked in a closed period: new bills, receipts, notes, adjustments, MRNs, STNs, MITs, issues, returns and requisitions dated in it; edits to their amounts, dates or parties; cancelling or deleting them.</li>
          <li>Still allowed: receiving an STN or MIT, settling an old bill with a new receipt, approving a shortage, posting to Tally.</li>
        </ul>
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Branches</h2>
          <p className="text-sm text-slate-500">A branch may close later than the company date, for example when it finishes its year-end first. The later date applies.</p>
        </div>
        <DataTable
          data={data?.branches ?? []}
          rowKey={(b) => b.branchId}
          isLoading={query.isLoading}
          emptyMessage="No branches."
          columns={[
            { header: "Branch", render: (b) => <span className={b.isActive ? "" : "text-slate-400"}>{b.name} <span className="text-xs text-muted-foreground">{b.code}</span></span> },
            { header: "Branch's own date", render: (b) => (b.closedUpTo ? show(b.closedUpTo) : <span className="text-slate-400">None</span>) },
            { header: "Closed up to", render: (b) => <span className="font-medium">{show(b.effective)}</span> },
            {
              header: "",
              render: (b) =>
                canClose && (
                  <Button size="sm" variant="outline" onClick={() => setEditing({ scope: "branch", branch: b })}>
                    Change
                  </Button>
                ),
            },
          ]}
        />
      </section>

      {data && editing && (
        <CloseDateModal
          key={editing.scope === "branch" ? editing.branch.branchId : "company"}
          data={data}
          target={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CloseDateModal({
  data,
  target,
  onClose,
}: {
  data: BooksClosed;
  target: { scope: "company" } | { scope: "branch"; branch: BranchRow };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const current = target.scope === "company" ? data.closedUpTo : target.branch.closedUpTo;
  const [date, setDate] = useState(current ?? (target.scope === "company" ? lastYearEnd(data.today) : ""));
  const [clear, setClear] = useState(false);
  const [reason, setReason] = useState("");
  const next = clear ? null : date || null;
  const reopens = current !== null && (next === null || next < current);
  const branchId = target.scope === "branch" ? target.branch.branchId : undefined;

  const check = useQuery({
    queryKey: [...KEY, "check", next, branchId],
    queryFn: () => apiGet<Check>(`/books-closed/check?date=${next}${branchId ? `&branchId=${branchId}` : ""}`),
    enabled: !!next && !reopens && next !== current,
  });

  const save = useMutation({
    mutationFn: () =>
      apiPut<BooksClosed>(branchId ? `/books-closed/branches/${branchId}` : "/books-closed", {
        closedUpTo: next,
        ...(reopens && { reason: reason.trim() }),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(KEY, result);
      toast.success(reopens ? "Books reopened" : "Books closed");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Could not change the closed date")),
  });

  const invalid =
    (!clear && !date) || (next !== null && next >= data.today) || next === current || (reopens && reason.trim().length < 5) ||
    (target.scope === "branch" && next !== null && data.closedUpTo !== null && next <= data.closedUpTo);
  const openItems = useMemo(() => (check.data?.open ?? []).filter((o) => o.count > 0), [check.data]);

  return (
    <ModalFame
      isOpen
      onClose={onClose}
      title={target.scope === "company" ? "Close the books: all branches" : `Close the books: ${target.branch.name}`}
      description={`Now closed up to ${show(current)}.`}
      preventAccidentalClose={save.isPending}
    >
      <div className="grid gap-4">
        <Field label="Closed up to (the last closed day)">
          <input type="date" className={inputCls} value={date} max={new Date(Date.parse(`${data.today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)} disabled={clear} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {current && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={clear} onChange={(e) => setClear(e.target.checked)} />
            {target.scope === "company" ? "Reopen everything (no closed date)" : "Remove this branch's own date (the company date applies)"}
          </label>
        )}
        {target.scope === "branch" && data.closedUpTo && !clear && date && date <= data.closedUpTo && (
          <p className="text-sm text-red-600">The company books are closed up to {show(data.closedUpTo)}: a branch date must be later.</p>
        )}
        {next && next >= data.today && <p className="text-sm text-red-600">Only past days can be closed.</p>}

        {reopens && (
          <Field label="Reason for reopening (required)">
            <textarea className={inputCls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Auditor's adjustment to December 2025 receipts" />
          </Field>
        )}

        {!reopens && openItems.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" aria-live="polite">
            <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="size-4" /> Still open on or before {show(next)}</p>
            <ul className="mt-1 list-disc pl-5">
              {openItems.map((o) => <li key={o.key}>{o.count.toLocaleString()} {o.label}</li>)}
            </ul>
            <p className="mt-1">They can still be completed, but no longer cancelled or edited.</p>
          </div>
        )}
        {!reopens && check.data && openItems.length === 0 && <p className="text-sm text-emerald-700">Nothing is left open in that period.</p>}

        <div className="flex gap-2">
          <Button disabled={invalid || save.isPending} onClick={() => save.mutate()} variant={reopens ? "destructive" : "default"}>
            {save.isPending ? "Saving…" : reopens ? (next ? `Reopen to ${show(next)}` : "Reopen") : `Close up to ${show(next)}`}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
        </div>
      </div>
    </ModalFame>
  );
}
