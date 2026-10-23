"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CalendarDays } from "lucide-react";
import { inputCls } from "./FormField";
import { openNativePicker } from "./native-picker";

interface DateInputProps {
  value?: string;
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  onBlur?: () => void;
  invalid?: boolean;
  min?: string;
  max?: string;
}

function formatToDisplay(iso?: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function maskDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  let out = digits;
  if (digits.length > 4) {
    out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  } else if (digits.length > 2) {
    out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return out;
}

function displayToISO(display: string): string {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12) return "";
  if (day < 1 || day > 31) return "";
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return "";
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function DateInput({
  value = "",
  onChange,
  className = inputCls,
  placeholder = "dd/mm/yyyy",
  disabled,
  onBlur,
  invalid,
  min,
  max,
}: DateInputProps) {
  const [display, setDisplay] = useState(() => formatToDisplay(value));
  const picker = useRef<HTMLInputElement>(null);

  // Keep a half-typed date while the parent holds "" for it.
  useEffect(() => {
    setDisplay(current => (displayToISO(current) === value ? current : formatToDisplay(value)));
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const masked = maskDisplay(e.target.value);
    setDisplay(masked);
    onChange(displayToISO(masked));
  }

  return (
    <div className="relative w-full min-w-0">
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onBlur={onBlur}
        aria-invalid={invalid}
        className={`${className} pr-10`}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        type="button"
        aria-label="Choose date from calendar"
        disabled={disabled}
        onClick={() => openNativePicker(picker.current)}
        className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min={min}
        max={max}
        value={/^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ""}
        onChange={event => onChange(event.target.value)}
        className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
      />
    </div>
  );
}
