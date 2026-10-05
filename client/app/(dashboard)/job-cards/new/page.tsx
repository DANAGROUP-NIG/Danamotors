"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { JobCardCreateForm } from "@/features/job-cards";
import { useVehicle } from "@/features/vehicles/hooks/use-vehicle";
import { useAppointment } from "@/features/appointments/hooks/use-appointment";

/**
 * Full-page job opening, for links that carry a vehicle (vehicle page, campaigns) or an
 * appointment. The job cards list and appointment page open the same form in a modal.
 */
export default function NewJobCardPage() {
  const router = useRouter();
  const params = useSearchParams();
  const appointmentId = params.get("appointmentId") ?? "";
  const appointmentQuery = useAppointment(appointmentId);
  const appointment = appointmentQuery.data?.appointment;
  const vehicleId = appointment?.vehicleId ?? params.get("vehicleId") ?? "";
  const vehicleQuery = useVehicle(appointmentId ? "" : vehicleId);
  const vehicle = vehicleQuery.data?.vehicle;

  const loading = (!!appointmentId && appointmentQuery.isPending) || (!appointmentId && !!vehicleId && vehicleQuery.isPending);

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader title="New Job Card" description="Open a job for a customer vehicle." />
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <JobCardCreateForm
          key={`${appointmentId}:${vehicleId}`}
          defaultValues={{
            vehicleId,
            customerId: appointment?.customerId ?? vehicle?.customer?.id ?? "",
            appointmentId: appointment?.id ?? "",
            ...(appointment?.serviceId && { serviceId: appointment.serviceId }),
            ...(appointment?.branch?.name && { branchName: appointment.branch.name }),
          }}
          onSuccess={(id) => router.push(`/job-cards/${id}`)}
          onClose={() => router.back()}
        />
      )}
    </div>
  );
}
