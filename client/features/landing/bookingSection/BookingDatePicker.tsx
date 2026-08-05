"use client";

import { DayPicker } from "react-day-picker";
import { Badge } from "@/components/ui/badge";

interface BookingDatePickerProps {
  selectedDate?: Date;
  onSelectDate: (date?: Date) => void;
}

export function BookingDatePicker({
  selectedDate,
  onSelectDate,
}: BookingDatePickerProps) {
  return (
    <div>
      <Badge tone="blue">Book service</Badge>
      <h2 className="mt-4 text-3xl font-black sm:text-5xl">
        Schedule your next Dana service visit.
      </h2>
      <p className="mt-5 text-lg leading-8 text-muted-foreground">
        Pick a date, share your vehicle details, and optionally attach a service document, photo, or previous report.
      </p>
      <div className="mt-8 rounded-lg border border-border bg-background p-4">
        <DayPicker mode="single" selected={selectedDate} onSelect={onSelectDate} />
      </div>
    </div>
  );
}
