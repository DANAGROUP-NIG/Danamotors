"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { useForm } from "react-hook-form";
import { DayPicker } from "react-day-picker";
import { toast } from "sonner";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import FormField from "./FormField";

const bookingSchema = z.object({
  name: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  vehicle: z.string().min(2, "Enter your vehicle model"),
  serviceType: z.string().min(1, "Select a service type"),
});

type BookingValues = z.infer<typeof bookingSchema>;

export default function BookingSection() {
  const [selected, setSelected] = useState<Date | undefined>(new Date(2026, 6, 9));
  const { acceptedFiles, getRootProps, getInputProps, isDragActive } = useDropzone({
    maxFiles: 1,
    onDrop: () => toast.success("Vehicle document added to your service request"),
  });
  const form = useForm<BookingValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      name: "",
      email: "",
      vehicle: "",
      serviceType: "",
    },
  });

  function onSubmit(values: BookingValues) {
    toast.success(`Service request received for ${values.vehicle}`);
    form.reset();
  }

  return (
    <section id="book" className="bg-card py-24">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div>
          <Badge tone="blue">Book service</Badge>
          <h2 className="mt-4 text-3xl font-black sm:text-5xl">Schedule your next Dana service visit.</h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Pick a date, share your vehicle details, and optionally attach a service document, photo, or previous report.
          </p>
          <div className="mt-8 rounded-lg border border-border bg-background p-4">
            <DayPicker mode="single" selected={selected} onSelect={setSelected} />
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Send a service request</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
              <FormField label="Full name" error={form.formState.errors.name?.message}>
                <input className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring" {...form.register("name")} />
              </FormField>
              <FormField label="Email address" error={form.formState.errors.email?.message}>
                <input className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring" {...form.register("email")} />
              </FormField>
              <FormField label="Vehicle model" error={form.formState.errors.vehicle?.message}>
                <input
                  className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Toyota Corolla, Hyundai Tucson..."
                  {...form.register("vehicle")}
                />
              </FormField>
              <FormField label="Service type" error={form.formState.errors.serviceType?.message}>
                <select className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring" {...form.register("serviceType")}>
                  <option value="">Select service type</option>
                  <option value="routine">Routine service</option>
                  <option value="diagnostic">Diagnostics</option>
                  <option value="repair">Repair request</option>
                  <option value="inspection">Vehicle inspection</option>
                </select>
              </FormField>
              <div
                {...getRootProps()}
                className={cn(
                  "grid min-h-28 cursor-pointer place-items-center rounded-lg border border-dashed border-border bg-background p-5 text-center",
                  isDragActive && "border-primary bg-secondary",
                )}
              >
                <input {...getInputProps()} />
                <div>
                  <UploadCloud className="mx-auto size-6 text-primary" />
                  <p className="mt-2 text-sm font-semibold">
                    {acceptedFiles[0]?.name ?? "Drop a vehicle document, photo, or report"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">PDF, image, or service record</p>
                </div>
              </div>
              <Button className="mt-2" size="lg" type="submit">
                Book Service
                <ArrowRight />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
