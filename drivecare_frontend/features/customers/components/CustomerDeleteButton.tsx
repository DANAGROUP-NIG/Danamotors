"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeleteCustomer } from "../hooks/use-delete-customer";
import type { Customer } from "../types/customer.types";

interface CustomerDeleteButtonProps {
  customer: Customer;
  onSuccess?: () => void;
}

export function CustomerDeleteButton({
  customer,
  onSuccess,
}: CustomerDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const del = useDeleteCustomer();

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Delete?</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
          disabled={del.isPending}
          onClick={() =>
            del.mutate(customer.id, {
              onSuccess: () => {
                setConfirming(false);
                onSuccess?.();
              },
              onError: () => setConfirming(false),
            })
          }
        >
          {del.isPending ? "…" : "Yes"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={() => setConfirming(false)}
          disabled={del.isPending}
        >
          No
        </Button>
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
      aria-label={`Delete ${customer.firstName} ${customer.lastName}`}
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
