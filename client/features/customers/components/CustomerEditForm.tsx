"use client";
import { useUpdateCustomer } from "../hooks/use-update-customer";
import { CustomerProfileForm } from "./CustomerProfileForm";
import type { Customer } from "../types/customer.types";
export function CustomerEditForm({ customer, onSuccess }: { customer: Customer; onSuccess?: () => void }) {
  const mutation = useUpdateCustomer(customer.id);
  return <CustomerProfileForm customer={customer} pending={mutation.isPending} failed={mutation.isError} onSubmit={(data) => mutation.mutate(data, { onSuccess })} />;
}
