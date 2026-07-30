"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useInventoryItem } from "@/features/inventory/hooks/use-inventory-item";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: item, isLoading, error } = useInventoryItem(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/inventory" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Inventory
        </Link>
        <p className="text-sm text-red-500">Spare part not found.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 lg:px-6">
      <Link href="/inventory" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Inventory
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="mb-1 text-xl font-semibold text-slate-800">{item.name}</h1>
        <p className="mb-6 text-sm text-slate-500">Part #: {item.partNumber}</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Category" value={item.category} />
          <DetailField label="Description" value={item.description} />
          <DetailField label="Unit Price" value={item.unitPrice ? `₦${item.unitPrice.toLocaleString()}` : null} />
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
