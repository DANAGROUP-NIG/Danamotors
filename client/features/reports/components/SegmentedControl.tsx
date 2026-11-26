"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedChoice {
  value: string;
  label: string;
  /** A choice that cannot be picked; `hint` says why (shown as its tooltip and read out). */
  disabled?: boolean;
  hint?: string;
  /** Classes for this choice when selected, for example a status colour. */
  selectedClassName?: string;
}

interface SegmentedControlProps {
  label: string;
  /** Null when nothing is chosen yet: the first enabled choice takes the Tab stop. */
  value: string | null;
  choices: SegmentedChoice[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Fill the width as a grid: two per row on phones, all in one row from the sm breakpoint. */
  fullWidth?: boolean;
  className?: string;
}

/**
 * A row of mutually exclusive choices (radio group), e.g. Detail + summary | Summary only | Detail only.
 * Tab reaches the selected choice; the arrow keys move between enabled choices and select them.
 */
export function SegmentedControl({ label, value, choices, onChange, disabled = false, fullWidth = false, className }: SegmentedControlProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = choices.map((choice, index) => (!disabled && !choice.disabled ? index : -1)).filter((index) => index >= 0);
  const selectedIndex = choices.findIndex((choice) => choice.value === value);
  const tabStop = selectedIndex >= 0 && enabled.includes(selectedIndex) ? selectedIndex : (enabled[0] ?? -1);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step || !enabled.length) return;
    event.preventDefault();
    const position = enabled.indexOf(index);
    const next = enabled[(position + step + enabled.length) % enabled.length];
    buttons.current[next]?.focus();
    onChange(choices[next].value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn(
        "rounded-md border border-border bg-muted/60 p-0.5",
        fullWidth ? "grid w-full grid-cols-2 gap-0.5 sm:grid-cols-4" : "inline-flex h-10 max-w-full overflow-x-auto",
        className,
      )}
    >
      {choices.map((choice, index) => {
        const selected = choice.value === value;
        const off = disabled || !!choice.disabled;
        return (
          <button
            key={choice.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={off || undefined}
            aria-label={choice.hint && choice.disabled ? `${choice.label}. ${choice.hint}` : undefined}
            title={choice.hint}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => !off && !selected && onChange(choice.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "whitespace-nowrap rounded px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              fullWidth ? "h-10 min-w-0 px-2" : "shrink-0",
              selected
                ? (choice.selectedClassName ?? "bg-primary text-primary-foreground shadow-sm")
                : off
                  ? "cursor-not-allowed text-muted-foreground/60"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}
