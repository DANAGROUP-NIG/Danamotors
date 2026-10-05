"use client";

import Link from "next/link";
import { useCustomer } from "@/features/customers/hooks/use-customer";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";

type Props = {
  value?: string;
  onChange?: (id: string) => void;
  onBlur?: () => void;
  error?: string;
  readOnly?: boolean;
  disabled?: boolean;
  branchId?: string;
};

/** A customer ID is the relationship; names and contact details come from the API. */
export function VehicleCustomerField({ value, onChange, onBlur, error, readOnly, disabled, branchId }: Props) {
  const { data: customer, isLoading, isError, refetch } = useCustomer(value ?? "");
  const activeBranch = useBranchStore(state => state.activeBranch);
  const { isSuperAdmin } = useAuth();
  const effectiveBranchId = branchId ?? (isSuperAdmin ? undefined : activeBranch?.id);
  const endpoint = effectiveBranchId
    ? `/customers?branchId=${encodeURIComponent(effectiveBranchId)}`
    : "/customers";
  const name = customer?.companyName || [customer?.firstName, customer?.lastName].filter(Boolean).join(" ");

  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/30 p-4" aria-label="Vehicle customer">
      {readOnly ? <h3 className="text-sm font-semibold">Linked customer</h3> : (
        <WorkshopPicker
          label="Customer"
          required
          endpoint={endpoint}
          collection="customers"
          value={value ?? ""}
          onChange={id => onChange?.(id)}
          onBlur={onBlur}
          selectedRecord={customer}
          error={error}
          disabled={disabled}
        />
      )}
      {value && isLoading && <p role="status" className="text-sm text-muted-foreground">Loading customer details...</p>}
      {value && isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load customer details.{" "}
          <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
        </p>
      )}
      {customer && (
        <div className="space-y-1 text-sm">
          <Link href={`/customers/${customer.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
            {name || "View customer"}
          </Link>
          {customer.code && <p className="text-muted-foreground">Customer code: {customer.code}</p>}
          <p className="break-words text-muted-foreground">
            {[customer.phoneNumber, customer.email].filter(Boolean).join(" / ") || "No contact details recorded"}
          </p>
        </div>
      )}
      {!value && <p className="text-sm text-muted-foreground">{readOnly ? "No customer currently linked. Use Change owner in the vehicle ownership section to assign one." : "Search by customer name, code or contact details before adding this vehicle."}</p>}
      {readOnly && value && <p className="text-sm text-muted-foreground">This vehicle is linked to the selected customer. Owner changes are recorded through the vehicle ownership workflow.</p>}
    </section>
  );
}
