"use client";
import Link from "next/link";
import { CalendarClock, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useLateReasons } from "../hooks/use-late-deliveries";
import { formatDateTime, LATE_KIND, LATE_PERMISSIONS, lateByText, lateKindOf } from "../lib/late-delivery.logic";
import { formatJobCardLateReason } from "../late-reason-label";
import { LateKindBadge, LateReasonChips } from "./late-ui";

interface Props {
  jobCard: { id: string; promisedAt?: string | null; deliveredAt?: string | null; lateReasonIds?: string[]; lateRemarks?: string | null };
}

/** On the job card: shown when the job was delivered after its promise, with a link to correct the reasons. */
export function JobCardLatePanel({ jobCard }: Props) {
  const { hasPermission } = useAuth();
  const late = jobCard.promisedAt && jobCard.deliveredAt ? lateKindOf(jobCard.promisedAt, jobCard.deliveredAt) : null;
  const reasons = useLateReasons();
  if (!late?.kind) return null;
  const ids = jobCard.lateReasonIds ?? [];
  const chips = ids.map((id) => reasons.data?.find((reason) => reason.id === id) ?? { id, code: "?", description: reasons.isLoading ? "Loading…" : "Unknown reason" });
  return (
    <section aria-label="Late delivery" className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 size-5 text-amber-600" aria-hidden />
          <div>
            <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
              Delivered {lateByText(late.kind, late.daysLate, late.minutesLate)} late <LateKindBadge kind={late.kind} />
            </p>
            <p className="text-sm text-slate-600">Promised {formatDateTime(jobCard.promisedAt)} · delivered {formatDateTime(jobCard.deliveredAt)}</p>
          </div>
        </div>
        {hasPermission(LATE_PERMISSIONS.UPDATE) && (
          <Button asChild size="sm" variant="outline">
            <Link href={`${LATE_KIND[late.kind].href}?job=${jobCard.id}`}><PencilLine className="size-4" /> {ids.length ? "Correct reasons" : "Record reasons"}</Link>
          </Button>
        )}
      </div>
      <div className="mt-3 pl-8">
        <LateReasonChips reasons={chips.map((reason) => ({ ...reason, description: formatJobCardLateReason(reason.description) }))} empty={<span className="text-sm font-medium text-amber-800">No reason recorded</span>} />
        {jobCard.lateRemarks && <p className="mt-2 text-sm text-slate-700">{jobCard.lateRemarks}</p>}
      </div>
    </section>
  );
}
