import Link from "next/link";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { formatDate, formatMoney } from "@/lib/format";
import type { DeclinedItem } from "../../types/job-estimate.types";
import { StageCard } from "../workspace/StageCard";

/** Work the customer declined on earlier visits, to offer again ("Recommended, declined"). */
export function DeclinedItemsCard({ items, description }: { items: DeclinedItem[]; description?: string }) {
  return (
    <StageCard title="Recommended, declined" description={description ?? "Work the customer declined on earlier visits. Offer it again if it still applies."}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">The customer has not declined any recommended work on earlier visits.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 flex-1 break-words">{item.description}</span>
              <span className="tabular-nums">{formatMoney(item.amount)}</span>
              <span className="flex items-center gap-2 text-muted-foreground">
                <StatusBadge status="Recommended, declined" tone="gray" className="text-xs normal-case" />
                <Link href={`/job-cards/${item.jobCardId}`} className="font-medium text-primary underline underline-offset-2">
                  Job {item.jobNumber}
                </Link>
                {item.declinedAt && <span>{formatDate(item.declinedAt)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </StageCard>
  );
}
