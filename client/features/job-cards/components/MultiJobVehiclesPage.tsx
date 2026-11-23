"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranchStore } from "@/store/branch.store";
import { lagosDate } from "@/features/service-transactions/transaction.logic";
import { canonicalJobStatus, JOB_CARD_STATUS_LABELS, JOB_CARD_STATUS_TONES, type JobCardStatus } from "../types/job-card-status";
import { useMultiJobVehicles } from "../hooks/use-multi-job-vehicles";

const payerLabels = new Map([
  ["CUSTOMER", "Customer"], ["WARRANTY", "Warranty"], ["INSURANCE", "Insurance"],
  ["COMPANY", "Company"], ["GOODWILL", "Goodwill"], ["FREE", "Free of charge"],
]);

export function MultiJobVehiclesPage() {
  const { isHydrated, hasPermission } = useAuth();
  const branchId = useBranchStore(state => state.activeBranch?.id);
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Vehicles with multiple job cards"
        actions={<Button asChild variant="outline"><Link href="/job-cards"><ArrowLeft className="size-4" />Job cards</Link></Button>}
      />
      {!isHydrated ? <LoadingSkeleton label="Checking access" />
        : hasPermission("jobcard:read") && hasPermission("jobcard:multi-vehicle:read")
          ? <VehicleResults key={branchId ?? "all"} branchId={branchId} />
          : <p role="status">You do not have permission to view vehicles with multiple job cards.</p>}
    </div>
  );
}

function VehicleResults({ branchId }: { branchId?: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dateError, setDateError] = useState("");
  const [dates, setDates] = useState<{ closedFrom?: string; closedTo?: string }>({});
  const [cursors, setCursors] = useState<string[]>([]);
  const { data, error, isPending, isFetching, refetch } = useMultiJobVehicles({ branchId, after: cursors.at(-1), ...dates });

  function applyDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to || from > to || Date.parse(to) - Date.parse(from) >= 366 * 86_400_000) {
      setDateError("Enter a date range of up to 366 days with the end on or after the start.");
      return;
    }
    setDateError("");
    setCursors([]);
    setDates({ closedFrom: from, closedTo: to });
  }

  function showOpenJobs() {
    setFrom("");
    setTo("");
    setDateError("");
    setCursors([]);
    setDates({});
  }

  const denied = isAxiosError(error) && error.response?.status === 403;
  return (
    <>
      <form onSubmit={applyDates} className="flex flex-wrap items-end gap-3">
        <Field label="Closed from">
          <input aria-label="Closed from" type="date" className={inputCls} value={from} onChange={event => setFrom(event.target.value)} />
        </Field>
        <Field label="Closed to" error={dateError}>
          <input aria-label="Closed to" aria-invalid={Boolean(dateError)} type="date" className={inputCls} value={to} onChange={event => setTo(event.target.value)} />
        </Field>
        <Button type="submit" disabled={isFetching}>Include closed jobs</Button>
        <Button type="button" variant="outline" onClick={showOpenJobs} disabled={!dates.closedFrom && !from && !to}>Show open jobs only</Button>
      </form>
      {isPending ? <LoadingSkeleton label="Loading vehicles" /> : error ? (
        <div role="alert" className="grid gap-2">
          <p>{denied ? "You do not have access to these job cards." : "Vehicles could not be loaded."}</p>
          {!denied && <div><Button variant="outline" onClick={() => refetch()}>Try again</Button></div>}
        </div>
      ) : (
        <>
          {data.vehicles.length === 0 && (
            <Card><CardContent className="grid gap-2 pt-6">
              <p>No vehicles match these filters.</p>
              <p className="text-sm text-muted-foreground">{dates.closedFrom ? "Try changing the closed date range." : "Include closed jobs to search a date range."}</p>
            </CardContent></Card>
          )}
          {data.vehicles.map(vehicle => (
            <Card key={vehicle.id}>
              <CardContent className="grid gap-3 pt-6">
                <div className="min-w-0">
                  <h2 className="break-words font-semibold">{vehicle.registrationNumber || "Registration not provided"}</h2>
                  <p className="break-all text-sm text-muted-foreground">VIN {vehicle.vin || "not provided"}</p>
                </div>
                <ul className="divide-y border-t">
                  {vehicle.jobs.map(job => {
                    const status = canonicalJobStatus(job.status) as JobCardStatus;
                    const knownStatus = Object.hasOwn(JOB_CARD_STATUS_LABELS, status);
                    const payers = job.payers.flatMap(payer => payerLabels.get(payer) ?? []);
                    return (
                      <li key={job.id} className="grid gap-2 py-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                        <div className="min-w-0">
                          <Link href={`/job-cards/${job.id}`} className="break-words font-medium text-primary underline underline-offset-4">{job.number}</Link>
                          <p className="text-muted-foreground">{lagosDate(job.date)}</p>
                        </div>
                        <div className="min-w-0 break-words">
                          <p>{job.customer || "Customer not provided"}</p>
                          <p className="text-muted-foreground">{job.branch}</p>
                        </div>
                        <div className="min-w-0 break-words">
                          <p>{job.serviceType || "Service type not provided"}</p>
                          <p className="text-muted-foreground">Payer: {payers.join(", ") || "Not recorded"}</p>
                        </div>
                        <div><StatusBadge status={knownStatus ? JOB_CARD_STATUS_LABELS[status].toLowerCase() : "Not recorded"} tone={knownStatus ? JOB_CARD_STATUS_TONES[status] : "gray"} /></div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
          {(cursors.length > 0 || data.nextCursor) && (
            <nav aria-label="Vehicle results pages" className="flex flex-wrap items-center gap-3">
              <Button variant="outline" disabled={cursors.length === 0 || isFetching} onClick={() => setCursors(current => current.slice(0, -1))}>Previous</Button>
              <span className="text-sm tabular-nums">Page {cursors.length + 1}</span>
              <Button variant="outline" disabled={!data.nextCursor || isFetching} onClick={() => {
                const cursor = data.nextCursor;
                if (cursor) setCursors(current => [...current, cursor]);
              }}>Next</Button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
