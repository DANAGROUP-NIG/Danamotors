"use client";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useJobBilling } from "../../hooks/use-job-billing";
import type { JobCard } from "../../types/job-card.types";
import { StageCard } from "../workspace/StageCard";
import { DeliverySection } from "../workspace/WorkshopSections";
import { InvoiceCard } from "./BillingCards";

/**
 * Delivery until phase 9 rebuilds it: the existing hand-over form, gated by the server's payment rule
 * (paid, credit approved or nothing to pay), and the invoice from Billing, read only.
 */
export function DeliveryWithBilling({ job }: { job: JobCard }) {
  const query = useJobBilling(job.id);
  if (query.isLoading) return <LoadingSkeleton label="Loading the invoice" />;
  if (query.isError || !query.data)
    return (
      <StageCard title="Invoice">
        <p role="alert" className="text-sm">
          The invoice could not be loaded. Check your connection and try again.
        </p>
        <div>
          <Button type="button" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
            {query.isFetching ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            Try again
          </Button>
        </div>
      </StageCard>
    );
  return (
    <>
      <DeliverySection job={job} paymentProblem={query.data.deliveryProblem} />
      <InvoiceCard step={query.data} readOnly />
    </>
  );
}
