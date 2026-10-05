"use client";
import { useUpdateVehicle } from "../hooks/use-update-vehicle";
import { VehicleProfileForm } from "./VehicleProfileForm";
import type { Vehicle } from "../types/vehicle.types";
export function VehicleEditForm({ vehicle, onSuccess }: { vehicle: Vehicle; onSuccess?: () => void }) {
  const mutation = useUpdateVehicle(vehicle.id);
  return <VehicleProfileForm vehicle={vehicle} pending={mutation.isPending} failed={mutation.isError} onSubmit={(data) => mutation.mutate(data, { onSuccess })} />;
}
