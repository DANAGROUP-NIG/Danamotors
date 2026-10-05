"use client";
import { useId, useState, type ReactNode } from "react";
import { CalendarDays, LockKeyhole } from "lucide-react";
import { DateInput } from "@/components/forms/DateInput";
export const openingInput = "h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
export const openingGrid = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3";

export const money = (value: number) => new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
}).format(value);

export const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString("en-GB") : "Not recorded";
export const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function OpeningField(
  {
    label,
    error,
    required,
    children,
  }: {
    label: string;
    error?: string;
    required?: boolean;
    children: ReactNode;
  },
) {
  return <label className="grid min-w-0 content-start gap-1.5"><span className="text-sm font-medium text-foreground">{label}{required && <span className="ml-1 text-destructive">*</span>}</span>{children}{error && <span role="alert" className="text-sm text-destructive">{error}</span>}</label>;
}

export function ReadOnlyField(
  {
    label,
    value,
    currency = false,
  }: {
    label: string;
    value?: string | number | null;
    currency?: boolean;
  },
) {
  return (
    <div className="min-w-0 space-y-1.5"><p className="text-sm font-medium">{label}</p><div
        className={`flex min-h-10 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm ${currency ? "tabular-nums" : ""}`}><LockKeyhole aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className={`min-w-0 break-words ${currency ? "ml-auto text-right font-medium" : ""}`}>{value === "" || value == null ? <span className="text-muted-foreground">Not recorded</span> : value}</span></div></div>
  );
}

export function OpeningCard(
  {
    title,
    description,
    children,
    action,
  }: {
    title: string;
    description?: string;
    children: ReactNode;
    action?: ReactNode;
  },
) {
  return <section className="min-w-0 rounded-xl border border-border bg-background p-4 shadow-sm md:p-6"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{title}</h3>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>{action}</div>{children}</section>;
}

export function CurrencyInput(
  {
    label,
    value,
    onChange,
    onBlur,
    error,
  }: {
    label: string;
    value?: number;
    onChange: (value: number) => void;
    onBlur?: () => void;
    error?: string;
  },
) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div className="relative"><span className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground">{"₦"}</span><input
        id={id}
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        inputMode="decimal"
        className={`${openingInput} pl-7 text-right tabular-nums ${error ? "border-destructive" : ""}`}
        value={focused ? draft : Number.isFinite(value) ? Number(value).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) : ""}
        onFocus={() => {
          setFocused(true);
          setDraft(value == null ? "" : String(value));
        }}
        onChange={event => {
          const raw = event.target.value.replace(/,/g, "");

          if (!/^\d*(\.\d{0,2})?$/.test(raw))
            return;

          setDraft(raw);
          onChange(raw === "" || raw === "." ? 0 : Number(raw));
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }} />{error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-destructive">{error}</p>}</div>
  );
}

// TODO(confirm): replace the legacy unknown label when its business meaning is agreed.
export const openingLabels = {
  customField: "Custom Field (TBD)",
  tyres: ["Tyre 1", "Tyre 2", "Tyre 3", "Tyre 4", "Tyre 5"],
};

export function OpeningDatePicker(
  {
    value,
    onChange,
    onBlur,
    invalid,
    min,
  }: {
    value?: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    invalid?: boolean;
    min?: string;
  },
) {
  return (
    <div className="relative"><DateInput
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        invalid={invalid}
        className={`${openingInput} pr-12`} /><span
        className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-r-lg border-l border-border text-muted-foreground"><CalendarDays className="h-4 w-4" /><input
          type="date"
          aria-label="Choose promised date from calendar"
          min={min}
          value={value || ""}
          onChange={event => onChange(event.target.value)}
          onBlur={onBlur}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></span></div>
  );
}
