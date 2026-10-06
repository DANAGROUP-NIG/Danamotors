"use client";
import { useCreateVehicle } from "../hooks/use-create-vehicle";
import { VehicleProfileForm } from "./VehicleProfileForm";

export function VehicleCreateForm({ onSuccess }: { onSuccess?: () => void }) {
  const mutation = useCreateVehicle();
  return <VehicleProfileForm  pending={mutation.isPending} failed={mutation.isError} onSubmit={(data) => mutation.mutate(data, { onSuccess })} />;
}
