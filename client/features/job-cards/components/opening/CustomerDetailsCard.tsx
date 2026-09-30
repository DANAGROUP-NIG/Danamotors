"use client";
import Link from "next/link";
import type { Customer } from "@/features/customers/types/customer.types";
import { ReadOnlyField, openingGrid, OpeningCard, formatDate } from "./opening-ui";
import type { ReactNode } from "react";

export function CustomerDetailsCard(
  {
    customer,
    lookup,
    error,
    loading,
    retry,
  }: {
    customer?: Customer;
    lookup: ReactNode;
    error: boolean;
    loading: boolean;
    retry: () => void;
  },
) {
  return (
    <OpeningCard
      title="Customer"
      description="Selecting an existing customer fills their saved details."
      action={customer && <Link
        href={`/customers/${customer.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium text-primary underline">Edit customer profile</Link>}>
      <div className="mb-4">{lookup}</div>
      {loading && <p role="status" className="mb-3 text-xs text-muted-foreground">Loading customer details...</p>}
      {error && <p role="alert" className="mb-3 text-xs text-destructive">Could not load customer. <button type="button" className="underline" onClick={retry}>Retry</button></p>}
      {!customer && !loading && !error && <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">Search by name, mobile number or registration to select a customer.</p>}
      {customer && <div className="space-y-4"><div className={openingGrid}>
          <ReadOnlyField label="Title" value={customer.salutation} /><ReadOnlyField
            label="Name"
            value={[customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.companyName} /><ReadOnlyField label="Category" value={customer.type} />
          {}
          <ReadOnlyField label="Name line 2 / contact person" value={customer.contactPerson} /><ReadOnlyField label="Name line 3 / registered name" value={customer.registeredName} /><ReadOnlyField label="Company" value={customer.companyName} />
          <ReadOnlyField
            label="Street"
            value={[customer.house, customer.street || customer.address].filter(Boolean).join(", ")} /><ReadOnlyField label="Locality" value={customer.zone} /><ReadOnlyField label="City" value={customer.city} />
          <ReadOnlyField label="State" value={customer.state} /><ReadOnlyField label="Pin" value={customer.postalCode} /><ReadOnlyField label="Mobile no." value={customer.phoneNumber} />
          <ReadOnlyField label="Phone (R)" value={customer.residencePhone} /><ReadOnlyField label="Phone (O)" value={[customer.office1, customer.office2].filter(Boolean).join(" / ")} /><ReadOnlyField label="Email" value={customer.email} />
          <ReadOnlyField label="Preferred follow-up day" value={customer.preferredFollowupDay} /><ReadOnlyField label="Follow-up time" value={customer.preferredFollowupTime} /><ReadOnlyField label="Birth date" value={formatDate(customer.dateOfBirth)} /><ReadOnlyField label="Anniversary date" value={formatDate(customer.anniversaryDate)} />
        </div><div className="flex flex-wrap gap-5 border-t pt-4 text-xs">{[
            ["Corporate", customer.type === "CORPORATE"],
            ["Govt. vehicle", customer.type === "GOVERNMENT"],
            ["VIP customer", customer.vip],
          ].map(
            ([label, checked]) => <label key={String(label)} className="flex items-center gap-2"><input type="checkbox" checked={!!checked} disabled className="accent-primary" />{label}</label>,
          )}</div><details className="rounded-lg border p-3"><summary className="cursor-pointer text-xs font-medium">More contact fields</summary><div className="mt-3 grid gap-4 sm:grid-cols-2"><ReadOnlyField label="STD" value={customer.stdCode} /><ReadOnlyField label="Fax" value={customer.fax} /></div></details><details className="rounded-lg border p-3"><summary className="cursor-pointer text-xs font-medium">Checklist to be followed</summary><p className="mt-3 text-xs text-muted-foreground">No checklist configured for this customer.</p></details></div>}
    </OpeningCard>
  );
}
