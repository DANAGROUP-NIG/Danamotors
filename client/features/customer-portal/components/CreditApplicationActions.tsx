"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortalCreditDecision } from "../hooks/use-portal-mutations";
import type { PortalCreditApplication } from "../types/portal.types";

export function CreditApplicationActions({
  application,
}: {
  application: PortalCreditApplication;
}) {
  const decision = usePortalCreditDecision();
  const [comments, setComments] = useState("");

  if (application.status !== "Pending") {
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
          application.status === "Approved"
            ? "bg-green-100 text-green-700"
            : application.status === "Declined"
              ? "bg-red-100 text-red-700"
              : "bg-amber-100 text-amber-700"
        }`}
      >
        {application.status}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={decision.isPending}
          onClick={() =>
            decision.mutate({
              id: application.id,
              payload: { approved: true, comments: comments || undefined },
            })
          }
        >
          <Check className="size-4" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={decision.isPending}
          onClick={() =>
            decision.mutate({
              id: application.id,
              payload: { approved: false, comments: comments || undefined },
            })
          }
        >
          <X className="size-4" />
          Decline
        </Button>
      </div>
      <textarea
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        placeholder="Optional note…"
        rows={2}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
