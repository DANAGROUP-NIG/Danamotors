"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useCustomer } from "@/features/customers";
import { CustomerPortalAccessCard } from "@/features/customers/components/CustomerPortalAccessCard";
import { CustomerCreditCard } from "@/features/customers/components/CustomerCreditCard";
import { useVehicles } from "@/features/vehicles/hooks/use-vehicles";
import { useAppointments } from "@/features/appointments/hooks/use-appointments";
import { useJobCards } from "@/features/job-cards/hooks/use-job-cards";
import { useInvoices } from "@/features/invoices/hooks/use-invoices";
import { useBranchStore } from "@/store/branch.store";
import {
  ArrowLeft,
  Loader2,
  Car,
  CalendarCheck,
  Wrench,
  FileText,
  ExternalLink,
} from "lucide-react";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const branchId = activeBranch?.id;

  const { data: customer, isLoading: loadingCustomer, error } = useCustomer(id);
  const { data: vehiclesData, isLoading: loadingVehicles } = useVehicles({
    customerId: id,
    limit: 50,
    branchId,
  });
  const { data: appointmentsData, isLoading: loadingAppointments } =
    useAppointments({ customerId: id, limit: 50, branchId });
  const { data: jobCardsData, isLoading: loadingJobCards } = useJobCards({
    customerId: id,
    limit: 50,
    branchId,
  });
  const { data: invoicesData, isLoading: loadingInvoices } = useInvoices({
    customerId: id,
    branchId,
  });

  if (loadingCustomer) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link
          href="/customers"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" /> Back to Customers
        </Link>
        <p className="text-sm text-red-500">Customer not found.</p>
      </div>
    );
  }

  const vehicles = vehiclesData?.vehicles ?? [];
  const appointments = appointmentsData?.appointments ?? [];
  const jobCards = jobCardsData?.jobCards ?? [];
  const invoices = invoicesData?.invoices ?? [];

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-4" /> Back to Customers
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-6 flex items-center gap-4">
          <span className="inline-grid size-12 place-items-center rounded-full bg-primary text-sm font-bold text-white">
            {customer.firstName?.[0]}
            {customer.lastName?.[0]}
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">
              {customer.firstName} {customer.lastName}
            </h1>
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
          <DetailField
            label="Contact Preference"
            value={customer.preferredContactMethod}
          />
        </div>
      </div>

      <CustomerPortalAccessCard customer={customer} />

      <CustomerCreditCard customer={customer} />

      <Section
        icon={<CalendarCheck className="size-4" />}
        title={`Appointments (${appointments.length})`}
        loading={loadingAppointments}
      >
        {appointments.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">No appointments found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-medium uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Notes</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-slate-700">
                      {new Date(a.scheduledAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          a.status === "Completed"
                            ? "bg-green-100 text-green-700"
                            : a.status === "Cancelled"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="max-w-xs truncate py-2 pr-4 text-slate-500">
                      {a.notes ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <Link
                        href={`/appointments/${a.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        View <ExternalLink className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        icon={<Car className="size-4" />}
        title={`Vehicles (${vehicles.length})`}
        loading={loadingVehicles}
      >
        {vehicles.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">No vehicles registered.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-medium uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-4">VIN</th>
                  <th className="py-2 pr-4">Make</th>
                  <th className="py-2 pr-4">Model</th>
                  <th className="py-2 pr-4">Year</th>
                  <th className="py-2 pr-4">Color</th>
                  <th className="py-2 pr-4">Warranty</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-700">
                      {v.vin}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {v.make ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {v.model ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {v.year ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {v.color ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {v.warrantyStatus ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <Link
                        href={`/vehicles/${v.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        View <ExternalLink className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        icon={<Wrench className="size-4" />}
        title={`Job Cards (${jobCards.length})`}
        loading={loadingJobCards}
      >
        {jobCards.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">No job cards created.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-medium uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-4">Job #</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Progress</th>
                  <th className="py-2 pr-4">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {jobCards.map((j) => (
                  <tr key={j.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-700">
                      {j.jobNumber}
                    </td>
                    <td className="max-w-xs truncate py-2 pr-4 text-slate-700">
                      {j.description}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize
                        bg-slate-100 text-slate-700"
                      >
                        {j.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {j.progress ?? 0}%
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      ${j.estimatedCost?.toFixed(2) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        icon={<FileText className="size-4" />}
        title={`Invoices (${invoices.length})`}
        loading={loadingInvoices}
      >
        {invoices.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">No invoices found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-medium uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-4">Invoice #</th>
                  <th className="py-2 pr-4">Issued</th>
                  <th className="py-2 pr-4">Due</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Paid</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
                  return (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs text-slate-700">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {new Date(inv.issuedDate).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {inv.dueDate
                          ? new Date(inv.dueDate).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        ${inv.total.toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        ${paid.toFixed(2)}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            inv.status === "Paid"
                              ? "bg-green-100 text-green-700"
                              : inv.status === "Overdue"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-slate-700">{value || "—"}</p>
    </div>
  );
}

function Section({
  icon,
  title,
  loading,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
        {icon}
        {title}
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-slate-300" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
