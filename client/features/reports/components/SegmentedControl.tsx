"use client";

import { cn } from "@/lib/utils";

interface SegmentedControlProps {
  label: string;
  value: string;
  choices: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}

/** A row of mutually exclusive choices (radio group), e.g. Detail + summary | Summary only | Detail only. */
export function SegmentedControl({ label, value, choices, onChange, className }: SegmentedControlProps) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex h-10 max-w-full overflow-x-auto rounded-md border border-border bg-muted/60 p-0.5", className)}>
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(choice.value)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}
