"use client";
import { useState } from "react";
import { useRegisterPortalVehicle } from "../hooks/use-portal-mutations";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";

export function RegisterVehicleForm(
  {
    onSuccess,
  }: {
    onSuccess?: () => void;
  },
) {
  const mutation = useRegisterPortalVehicle();
  const [vin, setVin] = useState("");
  const [registrationNumber, setRegistration] = useState("");
  const [catalogueId, setCatalogue] = useState("");
  const [colourId, setColour] = useState("");

  return (
    <form
      className="grid gap-4"
      onSubmit={e => {
        e.preventDefault();

        mutation.mutate({
          vin,
          registrationNumber,
          catalogueId,
          colourId,
        }, {
          onSuccess,
        });
      }}><Field label="VIN"><input required className={inputCls} value={vin} onChange={e => setVin(e.target.value)} /></Field><Field label="Registration (optional)"><input className={inputCls} value={registrationNumber} onChange={e => setRegistration(e.target.value)} /></Field><WorkshopPicker
        required
        label="Vehicle variant"
        endpoint="/portal/catalogue?kind=VARIANT"
        collection="items"
        value={catalogueId}
        onChange={setCatalogue} /><WorkshopPicker
        required
        label="Colour"
        endpoint="/portal/catalogue?kind=COLOUR"
        collection="items"
        value={colourId}
        onChange={setColour} />{mutation.isError && <p role="alert" className="text-red-600">Could not register vehicle. Check that the variant and colour belong to the same model.</p>}<Button disabled={mutation.isPending}>Register vehicle</Button></form>
  );
}
