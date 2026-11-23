"use client";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { lagosDate } from "@/features/service-transactions/transaction.logic";
import { useJobOpeningPrint } from "@/features/job-cards/hooks/use-job-opening-consent";
import { JobOpeningDocument } from "@/features/job-cards/components/JobOpeningDocument";

export default function SignedOpeningPrint() {
  const { id, signatureId } = useParams<{ id: string; signatureId: string }>();
  const { hasPermission } = useAuth();
  const allowed =
    hasPermission("jobcard:read") && hasPermission("estimate:print");
  const query = useJobOpeningPrint(id, signatureId, allowed);
  if (!allowed)
    return (
      <p>You do not have permission to print signed job-opening consent.</p>
    );
  if (query.isLoading)
    return <LoadingSkeleton label="Loading signed job-opening consent" />;
  if (query.isError || !query.data)
    return (
      <div className="space-y-2">
        <p role="alert">
          Signed job-opening consent could not be loaded. Check your access and
          reload.
        </p>
        <Button variant="outline" onClick={() => query.refetch()}>
          Reload signed consent
        </Button>
      </div>
    );
  const { document, signature, current } = query.data;
  return (
    <article className="job-opening-print mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <style>{`@page {size:A4 portrait;margin:15mm} @media print {body * {visibility:hidden} .job-opening-print,.job-opening-print * {visibility:visible} .job-opening-print {position:absolute;left:0;top:0;width:100%;max-width:none} .print-controls {display:none} .signature-block {break-inside:avoid}}`}</style>
      <div className="print-controls">
        <Button onClick={() => window.print()}>Print signed job opening</Button>
      </div>
      <h1 className="text-xl font-semibold">Signed job-opening approval</h1>
      <p className="text-sm">
        Signed revision {signature.revision}. This document does not approve
        repair costs.
      </p>
      {!current && (
        <p role="status" className="text-sm">
          The job details have changed since this signature. This is the
          original signed snapshot.
        </p>
      )}
      <JobOpeningDocument document={document} />
      <section className="signature-block space-y-2 border-t border-border pt-4 text-sm">
        <h2 className="font-semibold">Customer signature</h2>
        <Image
          src={signature.signatureImage}
          alt="Captured customer job-opening signature"
          width={600}
          height={200}
          unoptimized
          className="h-auto w-full max-w-xl bg-white"
        />
        <p>Signed by {signature.signerName}</p>
        {signature.relationship && (
          <p>Relationship or authority: {signature.relationship}</p>
        )}
        <p>Signed on {lagosDate(signature.signedAt)}, Africa/Lagos</p>
      </section>
    </article>
  );
}
