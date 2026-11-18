"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiGet } from "@/lib/api/apiClient";

/** Mirrors mergeHistory() in server customer-merge-extras.ts. */
type MergeEntry = {
  id: string;
  at: string;
  by: string;
  duplicate: { id: string; code: string | null; name: string; phone?: string | null; email?: string | null; address?: string | null };
  survivorBefore: { name: string; phone: string | null; email: string | null; address: string | null } | null;
  intoEarlierRecord: boolean;
  moved: Record<string, number>;
  kept: Partial<Record<"name" | "phone" | "email" | "address", "TARGET" | "SOURCE">>;
};

const MOVED_LABELS: Record<string, string> = {
  vehicles: "vehicles", vehicleOwnerships: "ownership records", appointments: "appointments", jobCards: "job cards",
  estimates: "estimates", customerApprovals: "approvals", warrantyCases: "warranty cases", invoices: "bills",
  receipts: "receipts", customerOrders: "customer orders", counterSaleReturns: "sale returns", vendorReceipts: "vendor receipts",
  partyNotes: "debit/credit notes", partyAdjustments: "adjustments", creditTransactions: "credit entries",
  creditApplications: "credit applications", outstandingLetters: "outstanding letters", documents: "documents",
  serviceHistory: "service history entries", earlierMerges: "earlier merged records",
};

/** Customers merged into this one: who merged them, what moved, and whose details were kept. */
export function CustomerMergeHistory({ customerId }: { customerId: string }) {
  const query = useQuery({
    queryKey: ["customers", "detail", customerId, "merge-history"],
    queryFn: () => apiGet<{ history: MergeEntry[] }>(`/customers/${customerId}/merge-history`),
  });
  const history = query.data?.history ?? [];
  if (query.isLoading || history.length === 0) return null;

  return (
    <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="font-semibold">Merge history</h2>
        <p className="text-sm text-slate-500">Duplicate records merged into this customer. The duplicates are kept, read-only, for audit.</p>
      </div>
      <ul className="grid gap-3">
        {history.map((m) => {
          const moved = Object.entries(m.moved).map(([k, n]) => `${n} ${MOVED_LABELS[k] ?? k}`);
          const taken = Object.entries(m.kept).filter(([, v]) => v === "SOURCE").map(([k]) => k);
          return (
            <li key={m.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <Link href={`/customers/${m.duplicate.id}`} className="font-medium text-primary hover:underline">
                    {m.duplicate.code ? `${m.duplicate.code} ` : ""}{m.duplicate.name}
                  </Link>
                  {m.intoEarlierRecord && <span className="ml-1 text-xs text-slate-500">(merged into a record that was later merged here)</span>}
                </span>
                <span className="text-slate-500">
                  {new Date(m.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {m.by}
                </span>
              </div>
              <p className="mt-1 text-slate-600">
                {[m.duplicate.phone, m.duplicate.email, m.duplicate.address].filter(Boolean).join(" · ") || "No contact details recorded"}
              </p>
              <p className="mt-1">Moved: {moved.length ? moved.join(", ") : "nothing"}.</p>
              {taken.length > 0 && <p className="mt-1">Details taken from the duplicate: {taken.join(", ")}.</p>}
              {m.survivorBefore && taken.length > 0 && (
                <p className="mt-1 text-slate-500">
                  Before: {[m.survivorBefore.name, m.survivorBefore.phone, m.survivorBefore.email, m.survivorBefore.address].filter(Boolean).join(" · ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
