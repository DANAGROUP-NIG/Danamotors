"use client";
import { Button } from '@/components/ui/button';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
export function BookingVehicleSummary({ id }: { id: string }) {
  const query = useVehicle(id); const vehicle = query.data?.vehicle;
  if (query.isLoading) return <p role="status">Loading vehicle details?</p>;
  if (query.isError) return <div role="alert">Could not load vehicle details. <Button type="button" variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>;
  if (!vehicle) return null;
  return <dl className="grid gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-3">{[['Registration', vehicle.registrationNumber], ['Model', vehicle.model], ['Variant', vehicle.trim], ['VIN', vehicle.vin], ['Engine number', vehicle.engineNumber]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value || '?'}</dd></div>)}</dl>;
}
