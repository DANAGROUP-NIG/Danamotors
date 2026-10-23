"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CalendarClock } from "lucide-react";
import { inputCls } from "./FormField";
import { openNativePicker } from "./native-picker";

interface DateTimeInputProps {
  value?: string;
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
}

type Meridiem = "am" | "pm";

function to12(hour24: number): { hour: number; meridiem: Meridiem } {
  if (hour24 === 0) return { hour: 12, meridiem: "am" };
  if (hour24 < 12) return { hour: hour24, meridiem: "am" };
  if (hour24 === 12) return { hour: 12, meridiem: "pm" };
  return { hour: hour24 - 12, meridiem: "pm" };
}

function to24(hour12: number, meridiem: Meridiem): number {
  if (meridiem === "am") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

function formatToDisplay(iso?: string): {
  display: string;
  meridiem: Meridiem;
} {
  if (!iso) return { display: "", meridiem: "am" };
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return { display: "", meridiem: "am" };
  if (!m[4]) return { display: `${m[3]}/${m[2]}/${m[1]}`, meridiem: "am" };
  const { hour, meridiem } = to12(Number(m[4]));
  return {
    display: `${m[3]}/${m[2]}/${m[1]} ${String(hour).padStart(2, "0")}:${m[5]}`,
    meridiem,
  };
}

function maskDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 12);
  let out = digits;
  if (digits.length > 10) {
    let hour = digits.slice(8, 10);
    let minute = digits.slice(10, 12);
    if (Number(hour) > 12) hour = "12";
    if (Number(minute) > 59) minute = "59";
    out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)} ${hour}:${minute}`;
  } else if (digits.length > 8) {
    out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)} ${digits.slice(8)}`;
  } else if (digits.length > 4) {
    out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  } else if (digits.length > 2) {
    out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return out;
}

function displayToISO(display: string, meridiem: Meridiem): string {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (!m) return "";
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const hour12 = Number(m[4]);
  const minute = Number(m[5]);
  if (month < 1 || month > 12) return "";
  if (day < 1 || day > 31) return "";
  if (hour12 < 1 || hour12 > 12) return "";
  if (minute > 59) return "";
  const hour24 = to24(hour12, meridiem);
  const d = new Date(year, month - 1, day, hour24, minute);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return "";
  }
  return `${m[3]}-${m[2]}-${m[1]}T${String(hour24).padStart(2, "0")}:${m[5]}`;
}

export function DateTimeInput({
  value = "",
  onChange,
  className = inputCls,
  placeholder = "dd/mm/yyyy hh:mm",
  disabled,
  min,
  max,
}: DateTimeInputProps) {
  const [display, setDisplay] = useState("");
  const [meridiem, setMeridiem] = useState<Meridiem>("am");
  const picker = useRef<HTMLInputElement>(null);
  const typed = useRef({ display: "", meridiem: "am" as Meridiem });
  typed.current = { display, meridiem };

  // Keep a half-typed value while the parent holds "" for it.
  useEffect(() => {
    if (displayToISO(typed.current.display, typed.current.meridiem) === value) return;
    const { display: d, meridiem: m } = formatToDisplay(value);
    setDisplay(d);
    setMeridiem(m);
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const masked = maskDisplay(e.target.value);
    setDisplay(masked);
    onChange(displayToISO(masked, meridiem));
  }

  function toggleMeridiem() {
    const next: Meridiem = meridiem === "am" ? "pm" : "am";
    setMeridiem(next);
    onChange(displayToISO(display, next));
  }

  return (
    <div className="flex items-stretch gap-2">
      <div className="relative w-full min-w-0">
        <input
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          className={`${className} pr-10`}
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="button"
          aria-label="Choose date and time from calendar"
          disabled={disabled}
          onClick={() => openNativePicker(picker.current)}
          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <CalendarClock className="h-4 w-4" />
        </button>
        <input
          ref={picker}
          type="datetime-local"
          tabIndex={-1}
          aria-hidden="true"
          min={min}
          max={max}
          value={/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? value.slice(0, 16) : ""}
          onChange={event => onChange(event.target.value)}
          className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
        />
      </div>
      <button
        type="button"
        onClick={toggleMeridiem}
        disabled={disabled}
        className="h-10 shrink-0 rounded-md border border-border bg-slate-50 px-3 text-sm font-bold text-foreground outline-none transition hover:bg-slate-100 focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        {meridiem}
      </button>
    </div>
  );
}
