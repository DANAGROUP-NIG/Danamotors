"use client";

import { useState } from "react";
import { Field, inputCls } from "@/components/forms/FormField";
import { useCustomer } from "../hooks/use-customer";
import {
  bookingCustomerFields,
  bookingCustomerFieldsToComplete,
  validateBookingCustomer,
  type BookingCustomerDetails,
  type BookingCustomerErrors,
  type BookingCustomerField,
} from "../../../../server/src/shared/booking-customer-details";

export function useBookingCustomerDetails(customerId: string) {
  const customer = useCustomer(customerId);
  const [draft, setDraft] = useState<{
    customerId: string;
    values: BookingCustomerDetails;
    errors: BookingCustomerErrors;
  }>({ customerId: "", values: {}, errors: {} });

  const values = draft.customerId === customerId ? draft.values : {};
  const errors = draft.customerId === customerId ? draft.errors : {};
  const fields = customer.data ? bookingCustomerFieldsToComplete(customer.data) : [];
  const ready = !!customer.data && !customer.isError;
  const accessDenied = (customer.error as { response?: { status?: number } } | null)
    ?.response?.status === 403;
  const setErrors = (next: BookingCustomerErrors) => setDraft({ customerId, values, errors: next });

  return {
    values,
    ready,
    reset: () => setDraft({ customerId: "", values: {}, errors: {} }),
    validate() {
      if (!ready) return false;
      const next = validateBookingCustomer({ ...customer.data, ...values });
      setErrors(next);
      return Object.keys(next).length === 0;
    },
    applyServerErrors(error: unknown) {
      const next = (error as { response?: { data?: { details?: { customerDetails?: BookingCustomerErrors } } } })
        ?.response?.data?.details?.customerDetails;
      if (next) {
        setErrors(next);
        void customer.refetch();
      }
      return !!next;
    },
    fields: customerId && (
      <BookingCustomerFields
        fields={fields}
        values={values}
        errors={errors}
        loading={customer.isPending}
        unavailable={customer.isError}
        accessDenied={accessDenied}
        onRetry={() => void customer.refetch()}
        onChange={(field, value) => setDraft({
          customerId,
          values: { ...values, [field]: value },
          errors: { ...errors, [field]: undefined },
        })}
      />
    ),
  };
}

function BookingCustomerFields({
  fields, values, errors, loading, unavailable, accessDenied, onRetry, onChange,
}: {
  fields: BookingCustomerField[];
  values: BookingCustomerDetails;
  errors: BookingCustomerErrors;
  loading: boolean;
  unavailable: boolean;
  accessDenied: boolean;
  onRetry: () => void;
  onChange: (field: BookingCustomerField, value: string) => void;
}) {
  if (loading) return <p role="status" className="text-sm text-muted-foreground">Loading customer details</p>;
  if (accessDenied) return <p role="alert" className="text-sm text-destructive">You do not have permission to read these customer details.</p>;
  if (unavailable) return (
    <p role="alert" className="text-sm text-destructive">
      Unable to load customer details.{" "}
      <button type="button" className="underline" onClick={onRetry}>Retry</button>
    </p>
  );
  if (!fields.length) return null;
  return (
    <fieldset className="grid min-w-0 gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
      <legend className="px-1 text-sm font-semibold">Complete customer details</legend>
      {fields.includes("tin") && fields.includes("nin") && (
        <p className="text-sm text-muted-foreground sm:col-span-2">Provide TIN or NIN (at least one)</p>
      )}
      {fields.map((field) => (
        <Field key={field} label={bookingCustomerFields[field]} error={errors[field]}
          required={field !== "tin" && field !== "nin"}>
          <input
            className={inputCls}
            type={field === "email" ? "email" : field === "phoneNumber" ? "tel" : "text"}
            inputMode={field === "nin" ? "numeric" : undefined}
            value={values[field] ?? ""}
            aria-invalid={!!errors[field]}
            aria-required={field !== "tin" && field !== "nin"}
            onChange={(event) => onChange(field, event.target.value)}
          />
        </Field>
      ))}
    </fieldset>
  );
}
