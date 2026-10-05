"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Copy, FileText, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { VehicleEditForm, useVehicle } from "@/features/vehicles";
import { VehicleHistoryCard } from "@/features/vehicles/components/VehicleHistoryCard";
import { useJobCards } from "@/features/job-cards";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { copyToClipboard } from "@/lib/table-actions";
import { useVehicleWarranty } from "@/features/warranty/hooks/use-warranty";
import { WarrantyCoverageCard } from "@/features/warranty/components/WarrantyCoverageCard";
import { OpenCampaignsCard } from "@/features/warranty/components/OpenCampaignsCard";
import { FilterPills, PageState, Pill, SectionCard, tdCls, thCls } from "@/features/warranty/components/ui";
import { COVERAGE_LABELS, COVERAGE_TONES, fmtDate, fmtKm, fmtNaira } from "@/features/warranty/lib/warranty-format";

type HistoryFilter = "" | "warranty" | "customer";

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useVehicle(id);
  const { hasPermission, isSuperAdmin } = useAuth();
  const canSeeWarranty = isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.READ);
  const warranty = useVehicleWarranty(id, undefined, canSeeWarranty);
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>("");

  const vehicle = data?.vehicle;
  const history = useJobCards({ search: vehicle?.vin, limit: 50 }, Boolean(vehicle?.vin));
  const jobs = useMemo(() => {
    const all = (history.data?.jobCards ?? []).filter((j) => j.vehicleId === id);
    if (filter === "warranty") return all.filter((j) => j.warrantyStatusAtCreation === "ACTIVE");
    if (filter === "customer") return all.filter((j) => j.warrantyStatusAtCreation !== "ACTIVE");
    return all;
  }, [history.data, filter, id]);

  if (isLoading) return <PageState loading />;
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

  const title = [vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ") || "Vehicle";

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <Link href="/vehicles" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
        <ArrowLeft className="size-4" /> Back to Vehicles
      </Link>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-5 rounded-xl border border-slate-200 bg-white p-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Vehicle</p>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => copyToClipboard(vehicle.vin, "VIN copied")}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-sm text-slate-800 hover:bg-slate-100"
              title="Copy VIN"
            >
              {vehicle.vin} <Copy className="size-3.5 text-slate-400" />
            </button>
            {vehicle.registrationNumber && (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-sm font-semibold text-slate-800">
                {vehicle.registrationNumber}
              </span>
            )}
            {vehicle.year && <span className="text-sm text-slate-500">{vehicle.year}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          {vehicle.customer && (
            <div className="space-y-1.5 border-slate-200 text-sm text-slate-700 sm:border-l sm:pl-6">
              <Link href={`/customers/${vehicle.customer.id}`} className="flex items-center gap-2 hover:underline">
                <User className="size-4 text-slate-400" /> {vehicle.customer.firstName} {vehicle.customer.lastName}
              </Link>
              {vehicle.customer.phoneNumber && (
                <p className="flex items-center gap-2">
                  <Phone className="size-4 text-slate-400" /> {vehicle.customer.phoneNumber}
                </p>
              )}
            </div>
          )}
          <div className="flex gap-2">
            {hasPermission("vehicle:update") && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {hasPermission("jobcard:create") && (
              <Button asChild>
                <Link href={`/job-cards/new?vehicleId=${vehicle.id}`}>New Job Card</Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Warranty & campaigns ── */}
      {canSeeWarranty && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <WarrantyCoverageCard check={warranty.data} isLoading={warranty.isLoading} />
            {warranty.isError && <p className="mt-2 text-sm text-red-500">Could not load warranty coverage.</p>}
          </div>
          <OpenCampaignsCard campaigns={warranty.data?.openCampaigns} isLoading={warranty.isLoading} />
        </div>
      )}

      {/* ── Service history ── */}
      <SectionCard
        icon={<FileText />}
        title="Service History"
        action={
          <FilterPills<HistoryFilter>
            value={filter}
            onChange={setFilter}
            options={[
              { label: "All", value: "" },
              { label: "Warranty", value: "warranty" },
              { label: "Customer pay", value: "customer" },
            ]}
          />
        }
      >
        {history.isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
        ) : jobs.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No job cards for this vehicle yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th className={thCls}>Job #</th>
                  <th className={thCls}>Date</th>
                  <th className={thCls}>Mileage</th>
                  <th className={thCls}>Warranty at creation</th>
                  <th className={thCls}>Status</th>
                  <th className={`${thCls} text-right`}>Est. cost (₦)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <td className={tdCls}>
                      <Link href={`/job-cards/${j.id}`} className="font-mono text-xs font-medium hover:underline">
                        {j.jobNumber}
                      </Link>
                    </td>
                    <td className={tdCls}>{fmtDate(j.createdAt)}</td>
                    <td className={tdCls}>{fmtKm(j.mileage)}</td>
                    <td className={tdCls}>
                      {j.warrantyStatusAtCreation ? (
                        <Pill status={COVERAGE_LABELS[j.warrantyStatusAtCreation]} tone={COVERAGE_TONES[j.warrantyStatusAtCreation]} />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      <Pill status={String(j.status).replace(/_/g, " ")} tone="gray" className="capitalize" />
                    </td>
                    <td className={`${tdCls} text-right`}>{j.estimatedCost ? fmtNaira(j.estimatedCost) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <VehicleHistoryCard vehicle={vehicle} showServiceHistory={false} />

      <ModalFame isOpen={editing} onClose={() => setEditing(false)} title="Edit vehicle">
        <VehicleEditForm vehicle={vehicle} onSuccess={() => setEditing(false)} />
      </ModalFame>
    </div>
  );
}
