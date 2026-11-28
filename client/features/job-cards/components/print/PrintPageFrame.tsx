"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, Loader2, Printer, RefreshCw, ShieldOff, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { printErrorStatus } from "../../hooks/use-job-print";

interface PrintQuery {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * The frame of a printed job document: Back to job card and Print on screen (never printed), the
 * loading, error, no-access and not-available states, and printing once loaded when opened with ?print=1.
 * pageCss holds the @page rule: the paper size and margins of this document.
 */
export function PrintPageFrame({
  jobId,
  name,
  printLabel,
  allowed,
  deniedMessage,
  query,
  pageCss,
  children,
}: {
  jobId: string;
  /** "job card" or "gate pass", for the state messages. */
  name: string;
  printLabel: string;
  allowed: boolean;
  deniedMessage: string;
  query: PrintQuery;
  pageCss: string;
  children: ReactNode;
}) {
  const printed = useRef(false);
  // "Print" on the job card opens this page with ?print=1: print once, as soon as the document has loaded.
  useEffect(() => {
    if (!query.data || printed.current || new URLSearchParams(window.location.search).get("print") !== "1") return;
    printed.current = true;
    // Let the signature images decode first, so they are on the printed page.
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [query.data]);

  const back = (
    <Link
      href={`/job-cards/${jobId}`}
      className="inline-flex items-center gap-1 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> Back to job card
    </Link>
  );

  let body: ReactNode;
  const status = printErrorStatus(query.error);
  if (!allowed)
    body = (
      <Problem icon={<ShieldOff aria-hidden="true" />} title={`You cannot print this ${name}`}>
        {deniedMessage}
      </Problem>
    );
  else if (query.isLoading) body = <LoadingSkeleton label={`Loading the ${name}`} />;
  else if (status === 403)
    body = (
      <Problem icon={<ShieldOff aria-hidden="true" />} title={`You cannot print this ${name}`}>
        This job belongs to another branch. Staff of that branch can print it.
      </Problem>
    );
  else if (status === 404)
    body = (
      <Problem icon={<TriangleAlert aria-hidden="true" />} title="Job card not found">
        The job card may have been removed. Go back to the job card list and open it again.
      </Problem>
    );
  else if (status === 409)
    body = (
      <Problem icon={<TriangleAlert aria-hidden="true" />} title={`The ${name} is not available yet`}>
        {apiErrorMessage(query.error, `This job has no ${name} to print yet.`)}
      </Problem>
    );
  else if (query.isError || !query.data)
    body = (
      <Problem icon={<TriangleAlert aria-hidden="true" />} title={`Could not load the ${name}`}>
        <span className="block">Check your connection and try again.</span>
        <Button type="button" variant="outline" className="mt-3" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {query.isFetching ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          Try again
        </Button>
      </Problem>
    );
  else body = children;

  const ready = allowed && !!query.data && !query.isError;
  return (
    <div className="job-print mx-auto w-full max-w-4xl space-y-4 p-4 print:max-w-none print:p-0">
      <style>{`${pageCss}
@media print {
  body * { visibility: hidden; }
  .job-print, .job-print * { visibility: visible; }
  .job-print { position: absolute; left: 0; top: 0; width: 100%; }
  .job-print .print-controls { display: none; }
  .job-print .print-keep { break-inside: avoid; }
  .job-print .job-back { break-before: page; }
  .job-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
.job-print { font-family: "Segoe UI", "Noto Sans", "DejaVu Sans", Arial, sans-serif; }`}</style>
      <div className="print-controls flex flex-wrap items-center justify-between gap-3">
        {back}
        {ready && (
          <Button type="button" onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            {printLabel}
          </Button>
        )}
      </div>
      {body}
    </div>
  );
}

function Problem({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section role="alert" className="flex gap-3 rounded-xl border border-border bg-card p-5 text-sm [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
      {icon}
      <div>
        <h1 className="text-base font-semibold">{title}</h1>
        <p className="mt-1 text-muted-foreground">{children}</p>
      </div>
    </section>
  );
}
