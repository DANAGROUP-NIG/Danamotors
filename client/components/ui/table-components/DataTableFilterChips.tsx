"use client";

import { cn } from "@/lib/utils";

export interface FilterChipOption {
  label: string;
  value: string;
}

interface DataTableFilterChipsProps {
  options: FilterChipOption[];
  selected: string;
  onChange: (value: string) => void;
}

export function DataTableFilterChips({
  options,
  selected,
  onChange,
}: DataTableFilterChipsProps) {
  return (
    <select
      className={cn(
        "h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring",
      )}
      value={selected}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
