"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/apiClient";

type Company = { name: string; tin: string | null; rcNumber: string | null; dealerCode: string | null };

export type PrintBranch = {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phoneNumber?: string | null;
};

/** Company details (Settings → Company), printed at the top of documents. */
export function useCompanyProfile() {
  return useQuery({
    queryKey: ["company-profile"],
    queryFn: async () => (await apiGet<{ company: Company }>("/company-settings/company")).company,
    staleTime: 10 * 60_000,
  });
}

/**
 * The top of a printed document: company and branch on the left, the document title and its
 * number, date and other references on the right.
 */
export function DocumentPrintHeader({
  branch,
  title,
  fields,
}: {
  branch: PrintBranch;
  title: string;
  fields: { label: string; value: ReactNode }[];
}) {
  const { data: company } = useCompanyProfile();
  const place = [branch.address, branch.city, branch.state].filter(Boolean).join(", ");
  const ids = [company?.tin && `TIN ${company.tin}`, company?.rcNumber && `RC ${company.rcNumber}`].filter(Boolean).join(" · ");
  return (
    <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
      <div className="min-w-0">
        <p className="text-lg font-bold uppercase leading-tight">{company?.name ?? "Dana Motors Limited"}</p>
        <p className="font-semibold">{branch.name}</p>
        {place && <p>{place}</p>}
        {branch.phoneNumber && <p>Tel: {branch.phoneNumber}</p>}
        {ids && <p>{ids}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xl font-bold uppercase tracking-wide">{title}</p>
        <table className="ml-auto mt-1">
          <tbody>
            {fields.map((f) => (
              <tr key={f.label}>
                <td className="whitespace-nowrap pr-3 text-left">{f.label}</td>
                <td className="font-mono font-semibold">{f.value ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </header>
  );
}

/** Signature lines at the foot of a printed document. */
export function PrintSignatures({ labels }: { labels: string[] }) {
  return (
    <div className="mt-12 grid gap-8" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
      {labels.map((label) => (
        <div key={label} className="border-t border-black pt-1 text-center">
          {label}
        </div>
      ))}
    </div>
  );
}

/** Wraps a print-only document: hidden on screen, A4 portrait with black text on paper. */
export function PrintDocument({ children }: { children: ReactNode }) {
  return (
    <article className="hidden text-[11pt] leading-snug text-black print:block">
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>
      {children}
    </article>
  );
}
