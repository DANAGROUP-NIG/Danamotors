"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { useEstimateApproval } from "../hooks/use-portal-mutations";
import type { PortalEstimate } from "../types/portal.types";

export function EstimateApprovalActions({ estimate }: { estimate: PortalEstimate }) {
  const approval = useEstimateApproval();
  const [comments, setComments] = useState("");

  const latestDecision = estimate.approvals?.[0];
  const decided = estimate.status === "Approved" || estimate.status === "Rejected";

  if (decided) {
    return (
      <div className="flex flex-col gap-1">
        <StatusBadge status={estimate.status} />
        {latestDecision?.decisionDate && (
          <span className="text-xs text-muted-foreground">
            Decided{" "}
            {new Date(latestDecision.decisionDate).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        )}
        {latestDecision?.comments && (
          <span className="text-xs text-muted-foreground">
            “{latestDecision.comments}”
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          disabled={approval.isPending}
          onClick={() => approval.mutate({ estimateId: estimate.id, payload: { approved: true, comments: comments || undefined } })}
        >
          <Check className="size-4" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={approval.isPending}
          onClick={() => approval.mutate({ estimateId: estimate.id, payload: { approved: false, comments: comments || undefined } })}
        >
          <X className="size-4" />
          Reject
        </Button>
      </div>
      <textarea
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        placeholder="Optional note for the workshop…"
        rows={2}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
