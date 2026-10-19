"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { apiGet, apiPut } from "@/lib/api/apiClient";
import { PageHeader } from "@/components/headers/page-header";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranches } from "@/features/branches/hooks/use-branches";
import type { DocumentTermType } from "@/components/DocumentTermsBlock";

const DOCUMENTS: [DocumentTermType, string][] = [
  ["JOB_ESTIMATE", "Job estimate"],
  ["JOB_CARD", "Job card"],
  ["JOB_BILL", "Job bill"],
  ["PARTS_QUOTATION", "Parts quotation / order"],
  ["COUNTER_SALE", "Counter sale"],
  ["RECEIPT", "Payment receipt"],
];
const errorMessage = (error: unknown) => isAxiosError(error) ? error.response?.data?.message ?? "Could not save" : "Could not save";

// Legacy Quotation Terms and Conditions Master and the Control screen's terms and footer messages.
export function DocumentTermsPage() {
  const { isAdminOrAbove } = useAuth();
  const queryClient = useQueryClient();
  const { data: branchData } = useBranches({ limit: 100 });
  const [documentType, setDocumentType] = useState<DocumentTermType>("JOB_ESTIMATE");
  const [branchId, setBranchId] = useState("");
  const [terms, setTerms] = useState("");
  const [footer, setFooter] = useState("");
  const query = useQuery({
    queryKey: ["document-terms", documentType, branchId],
    queryFn: () => apiGet<{ terms: string[]; footer: string | null }>(`/document-terms?documentType=${documentType}${branchId ? `&branchId=${branchId}` : ""}`),
  });
  useEffect(() => {
    setTerms(query.data?.terms.join("\n") ?? "");
    setFooter(query.data?.footer ?? "");
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => apiPut("/document-terms", {
      documentType,
      branchId: branchId || null,
      terms: terms.split("\n").map(line => line.trim()).filter(Boolean),
      footer: footer.trim() || null,
    }),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["document-terms"] }),
      queryClient.invalidateQueries({ queryKey: ["document-terms-effective"] }),
    ]),
  });
  return <div className="grid gap-5 p-4 lg:p-6">
    <PageHeader title="Terms & conditions" description="Numbered terms and the footer message printed on each document. A branch can override the company text." />
    <form className="grid max-w-4xl gap-4 rounded-xl border border-border bg-background p-4 shadow-sm md:p-6" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Document"><select className={inputCls} value={documentType} onChange={event => { setDocumentType(event.target.value as DocumentTermType); save.reset(); }}>
          {DOCUMENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Applies to"><select className={inputCls} value={branchId} onChange={event => { setBranchId(event.target.value); save.reset(); }}>
          <option value="">All branches (company)</option>
          {branchData?.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name} only</option>)}</select></Field>
      </div>
      {query.isError && <p role="alert">Could not load the terms. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>}
      <Field label="Terms (one per line, printed in this order; up to 20)">
        <textarea className={inputCls} rows={10} disabled={!isAdminOrAbove || query.isLoading} value={terms} onChange={event => setTerms(event.target.value)}
          placeholder={branchId ? "Blank uses the company terms" : "e.g. This estimate is valid for 3 days from the date of issue."} />
      </Field>
      <Field label="Footer message">
        <input className={inputCls} maxLength={500} disabled={!isAdminOrAbove || query.isLoading} value={footer} onChange={event => setFooter(event.target.value)}
          placeholder={branchId ? "Blank uses the company footer" : "e.g. Thank you for servicing your Kia at Dana Motors."} />
      </Field>
      {save.isError && <p role="alert" className="text-destructive">{errorMessage(save.error)}</p>}
      {save.isSuccess && <p role="status" className="text-sm text-emerald-700">Saved.</p>}
      {isAdminOrAbove && <Button className="justify-self-start" disabled={save.isPending}>Save terms</Button>}
    </form>
  </div>;
}
