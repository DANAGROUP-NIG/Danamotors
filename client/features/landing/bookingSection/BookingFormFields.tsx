"use client";

import { UseFormRegister, FieldErrors } from "react-hook-form";
import FormField from "./FormField";

export interface BookingValues {
  name: string;
  email: string;
  vehicle: string;
  serviceType: string;
}

interface BookingFormFieldsProps {
  register: UseFormRegister<BookingValues>;
  errors: FieldErrors<BookingValues>;
}

export function BookingFormFields({ register, errors }: BookingFormFieldsProps) {
  return (
    <>
      <FormField label="Full name" error={errors.name?.message}>
        <input
          className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
          {...register("name")}
        />
      </FormField>
      <FormField label="Email address" error={errors.email?.message}>
        <input
          className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
          {...register("email")}
        />
      </FormField>
      <FormField label="Vehicle model" error={errors.vehicle?.message}>
        <input
          className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
          placeholder="Toyota Corolla, Hyundai Tucson..."
          {...register("vehicle")}
        />
      </FormField>
      <FormField label="Service type" error={errors.serviceType?.message}>
        <select
          className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
          {...register("serviceType")}
        >
          <option value="">Select service type</option>
          <option value="routine">Routine service</option>
          <option value="diagnostic">Diagnostics</option>
          <option value="repair">Repair request</option>
          <option value="inspection">Vehicle inspection</option>
        </select>
      </FormField>
    </>
  );
}
