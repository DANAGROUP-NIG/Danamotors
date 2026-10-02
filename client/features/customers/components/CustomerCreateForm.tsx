"use client";
import { useCreateCustomer } from "../hooks/use-create-customer";
import { CustomerProfileForm } from "./CustomerProfileForm";
export function CustomerCreateForm({ onSuccess }: { onSuccess?: () => void }) {
  const mutation = useCreateCustomer();
  return <CustomerProfileForm  pending={mutation.isPending} failed={mutation.isError} onSubmit={(data) => mutation.mutate(data, { onSuccess })} />;
}
