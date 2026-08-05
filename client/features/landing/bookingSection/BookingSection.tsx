"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingDatePicker } from "./BookingDatePicker";
import { BookingFormFields, BookingValues } from "./BookingFormFields";
import { FileDropzone } from "./FileDropzone";

const bookingSchema = z.object({
  name: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  vehicle: z.string().min(2, "Enter your vehicle model"),
  serviceType: z.string().min(1, "Select a service type"),
});

export default function BookingSection() {
  const [selected, setSelected] = useState<Date | undefined>(new Date(2026, 6, 9));
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
        <BookingDatePicker selectedDate={selected} onSelectDate={setSelected} />

        <Card>
          <CardHeader>
            <CardTitle>Send a service request</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
              <BookingFormFields
                register={form.register}
                errors={form.formState.errors}
              />
              <FileDropzone />
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
