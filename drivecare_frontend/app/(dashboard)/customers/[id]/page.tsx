"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useCustomer } from "@/features/customers";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: customer, isLoading, error } = useCustomer(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Customers
        </Link>
        <p className="text-sm text-red-500">Customer not found.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 lg:px-6">
      <Link href="/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Customers
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-6 flex items-center gap-4">
          <span className="inline-grid size-12 place-items-center rounded-full bg-primary text-sm font-bold text-white">
            {customer.firstName?.[0]}{customer.lastName?.[0]}
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">{customer.firstName} {customer.lastName}</h1>
            <p className="text-sm text-slate-500">{customer.email}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Phone" value={customer.phoneNumber} />
          <DetailField label="Date of Birth" value={customer.dateOfBirth} />
          <DetailField label="License" value={customer.driverLicenseNumber} />
          <DetailField label="Address" value={customer.address} />
          <DetailField label="City" value={customer.city} />
          <DetailField label="State" value={customer.state} />
          <DetailField label="Postal Code" value={customer.postalCode} />
          <DetailField label="Country" value={customer.country} />
          <DetailField label="Contact Preference" value={customer.preferredContactMethod} />
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-700">{value || "—"}</p>
    </div>
  );
}
