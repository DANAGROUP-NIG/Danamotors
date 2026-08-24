"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useVehicle } from "@/features/vehicles";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useVehicle(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const vehicle = data?.vehicle;

  if (error || !vehicle) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/vehicles" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Vehicles
        </Link>
        <p className="text-sm text-red-500">Vehicle not found.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 lg:px-6">
      <Link href="/vehicles" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Vehicles
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="mb-1 text-xl font-semibold text-slate-800">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </h1>
        <p className="mb-6 text-sm text-slate-500">VIN: {vehicle.vin}</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Trim" value={vehicle.trim} />
          <DetailField label="Color" value={vehicle.color} />
          <DetailField label="Ownership Status" value={vehicle.ownershipStatus} />
          <DetailField label="Warranty Provider" value={vehicle.warrantyProvider} />
          <DetailField label="Warranty Status" value={vehicle.warrantyStatus} />
          <DetailField label="Warranty Expires" value={vehicle.warrantyExpiresAt} />
          {vehicle.customer && (
            <>
              <DetailField label="Owner" value={`${vehicle.customer.firstName} ${vehicle.customer.lastName}`} />
              <DetailField label="Owner Email" value={vehicle.customer.email} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-700">{value ?? "—"}</p>
    </div>
  );
}
