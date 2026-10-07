type ServiceChargeJob = {
  serviceId?: string | null;
  serviceTypeId?: string | null;
  service?: { name: string } | null;
  serviceType?: { description: string } | null;
};

// Existing appointment-linked jobs retain their catalogue reference. New
// workshop-only jobs identify the charge by their selected service type.
export const serviceChargeReference = (job: ServiceChargeJob) => job.serviceId ?? job.serviceTypeId ?? undefined;
export const serviceChargeDescription = (job: ServiceChargeJob) => job.serviceType?.description ?? job.service?.name ?? 'Service charge';
