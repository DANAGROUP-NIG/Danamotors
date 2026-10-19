"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/apiClient";

export type DocumentTermType = "JOB_ESTIMATE" | "JOB_CARD" | "JOB_BILL" | "PARTS_QUOTATION" | "COUNTER_SALE" | "RECEIPT";

/** The terms and footer that print on a document (Settings → Terms & Conditions); nothing when none are set. */
export function DocumentTermsBlock({ documentType, branchId }: { documentType: DocumentTermType; branchId?: string | null }) {
  const { data } = useQuery({
    queryKey: ["document-terms-effective", documentType, branchId ?? ""],
    queryFn: () => apiGet<{ terms: string[]; footer: string | null }>(
      `/document-terms/effective?documentType=${documentType}${branchId ? `&branchId=${branchId}` : ""}`,
    ),
    staleTime: 5 * 60_000,
  });
  if (!data?.terms.length && !data?.footer) return null;
  return (
    <section className="grid gap-2 border-t pt-4 text-sm">
      {!!data.terms.length && <>
        <h2 className="font-semibold">Terms and conditions</h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground print:text-black">
          {data.terms.map((term, index) => <li key={index}>{term}</li>)}
        </ol>
      </>}
      {data.footer && <p className="text-center text-muted-foreground print:text-black">{data.footer}</p>}
    </section>
  );
}
