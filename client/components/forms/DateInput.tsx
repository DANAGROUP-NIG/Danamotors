"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { inputCls } from "./FormField";

interface DateInputProps {
  value?: string;
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
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
}: DateInputProps) {
  const [display, setDisplay] = useState(() => formatToDisplay(value));

  useEffect(() => {
    setDisplay(formatToDisplay(value));
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const masked = maskDisplay(e.target.value);
    setDisplay(masked);
    onChange(displayToISO(masked));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
