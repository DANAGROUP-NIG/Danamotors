"use client";
import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { CustomerRequestsTab } from '@/features/job-cards/components/opening/CustomerRequestsTab';
import type { CreateJobCardFormValues } from '@/features/job-cards/schemas/job-card.schema';
import type { BookingRequest } from '@/features/appointments/types/appointment.types';

export function BookingRequestGrid({ value, onChange, vehicleId }: { value: BookingRequest[]; onChange: (rows: BookingRequest[]) => void; vehicleId?: string }) {
  const form = useForm<CreateJobCardFormValues>({ defaultValues: { complaints: value, vehicleId } });
  const { watch, getValues, setValue } = form;
  useEffect(() => {
    const subscription = watch((_values, { name }) => {
      // Field-array removals can notify without a specific field name.
      if (!name || name.startsWith('complaints')) onChange(getValues('complaints'));
    });
    return () => subscription.unsubscribe();
  }, [watch, getValues, onChange]);
  useEffect(() => { setValue('vehicleId', vehicleId ?? ''); }, [setValue, vehicleId]);
  return <FormProvider {...form}><CustomerRequestsTab showLastVisit={false} /></FormProvider>;
}
