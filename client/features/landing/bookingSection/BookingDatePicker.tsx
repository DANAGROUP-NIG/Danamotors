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
    <div className="relative overflow-hidden rounded-[28px] border border-blue-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white shadow-[0_30px_80px_-40px_rgba(30,64,175,0.75)] sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.28),_transparent_55%)]" aria-hidden />

      <div className="relative">
        <Badge tone="blue" className="border-blue-300/30 bg-blue-500/10 text-blue-100">
          Book service
        </Badge>

        <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          Schedule your next Dana service visit.
        </h2>

        <p className="mt-4 max-w-lg text-base leading-7 text-slate-300">
          Pick a date, share your vehicle details, and let our team confirm the best time for your visit.
        </p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/70 p-3 backdrop-blur-sm sm:p-4">
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={onSelectDate}
            className="mx-auto w-full text-slate-100"
            classNames={{
              months: "flex w-full justify-center",
              month: "space-y-3",
              caption: "flex items-center justify-between px-1 py-1 text-sm font-medium text-slate-100",
              nav: "flex items-center gap-2",
              nav_button: "h-8 w-8 rounded-full border border-white/10 bg-slate-800 text-slate-100 hover:bg-slate-700",
              table: "w-full border-collapse",
              head_row: "grid grid-cols-7 gap-1 text-[11px] uppercase tracking-[0.2em] text-slate-400",
              head_cell: "flex h-8 items-center justify-center",
              row: "grid grid-cols-7 gap-1",
              cell: "flex items-center justify-center",
              day: "h-9 w-9 rounded-full text-sm text-slate-200 transition hover:bg-blue-500/20 hover:text-white",
              day_selected: "bg-blue-500 font-semibold text-white shadow-lg shadow-blue-500/30",
              day_today: "border border-blue-400/60 bg-blue-500/10 text-blue-100",
              day_outside: "text-slate-500 opacity-60",
              day_disabled: "text-slate-600 opacity-50",
            }}
          />
        </div>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-100">
          <span className="size-2 rounded-full bg-emerald-400" aria-hidden />
          {selectedDate ? selectedDate.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }) : 'No date selected yet'}
        </div>
      </div>
    </div>
  );
}
