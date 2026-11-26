"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, Clock, LockKeyhole } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { openingTimeParts, openingTimeValue, type OpeningTimeParts } from "./opening-time";
export const openingInput =
  "h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
export const openingGrid =
  "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3";

export const money = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(value);

export const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB") : "Not recorded";
export const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function OpeningField({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 content-start gap-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </span>
      {children}
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}

export function ReadOnlyField({
  label,
  value,
  currency = false,
}: {
  label: string;
  value?: string | number | null;
  currency?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div
        className={`flex min-h-10 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm ${currency ? "tabular-nums" : ""}`}
      >
        <LockKeyhole
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        />
        <span
          className={`min-w-0 break-words ${currency ? "ml-auto text-right font-medium" : ""}`}
        >
          {value === "" || value == null ? (
            <span className="text-muted-foreground">Not recorded</span>
          ) : (
            value
          )}
        </span>
      </div>
    </div>
  );
}

export function OpeningCard({
  title,
  description,
  children,
  action,
  collapsible = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  collapsible?: boolean;
}) {
  if (collapsible)
    return (
      <details className="group min-w-0 rounded-xl border border-border bg-background shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-6 [&::-webkit-details-marker]:hidden">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <ChevronDown
            aria-hidden
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="border-t border-border p-4 md:p-6">
          {action && <div className="mb-4 flex justify-end">{action}</div>}
          {children}
        </div>
      </details>
    );
  return (
    <section className="min-w-0 rounded-xl border border-border bg-background p-4 shadow-sm md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CurrencyInput({
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
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground">
        {"₦"}
      </span>
      <input
        id={id}
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        inputMode="decimal"
        className={`${openingInput} pl-7 text-right tabular-nums ${error ? "border-destructive" : ""}`}
        value={
          focused
            ? draft
            : Number.isFinite(value)
              ? Number(value).toLocaleString("en-NG", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : ""
        }
        onFocus={() => {
          setFocused(true);
          setDraft(value == null ? "" : String(value));
        }}
        onChange={(event) => {
          const raw = event.target.value.replace(/,/g, "");

          if (!/^\d*(\.\d{0,2})?$/.test(raw)) return;

          setDraft(raw);
          onChange(raw === "" || raw === "." ? 0 : Number(raw));
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
      />
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// TODO(confirm): replace the legacy unknown label when its business meaning is agreed.
export const openingLabels = {
  customField: "Custom Field (TBD)",
  tyres: ["Tyre 1", "Tyre 2", "Tyre 3", "Tyre 4", "Tyre 5"],
};

export function OpeningTimePicker({ value = "", onChange, onBlur, invalid }: {
  value?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const pickerId = useId();
  const parts = openingTimeParts(value);
  const scrollToSelected = (column: HTMLDivElement | null) => {
    const selected = column?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (column && selected) column.scrollTop = selected.offsetTop - column.clientHeight / 2 + selected.offsetHeight / 2;
  };
  const optionClass = (selected: boolean) => `h-9 w-full rounded text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`;
  function close() {
    setOpen(false);
    onBlur?.();
    trigger.current?.focus();
  }
  function select(change: Partial<OpeningTimeParts>) {
    onChange(openingTimeValue({ ...parts, ...change }));
  }
  return <div className="min-w-0 space-y-2" onKeyDown={event => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }}>
    <button ref={trigger} type="button" aria-label="Choose promised time" aria-expanded={open} aria-controls={pickerId} aria-invalid={invalid} onBlur={onBlur} onClick={() => open ? close() : setOpen(true)} className={`${openingInput} flex items-center justify-between gap-2 text-left`}>
      <span className={value ? "" : "text-muted-foreground"}>{value ? `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')} ${parts.period}` : "hh:mm AM/PM"}</span>
      <Clock className="h-4 w-4 text-muted-foreground" />
    </button>
    {open && <div id={pickerId} role="region" aria-label="Promised time picker" className="rounded-lg border border-border bg-background p-3">
      <div className="grid grid-cols-3 gap-2">
        <div><p className="mb-2 text-center text-xs text-muted-foreground">Hour</p><div ref={scrollToSelected} role="group" aria-label="Hour" className="relative max-h-48 space-y-1 overflow-y-auto">{Array.from({ length: 12 }, (_, index) => index + 1).map(hour => <button key={hour} type="button" aria-pressed={!!value && parts.hour === hour} className={optionClass(!!value && parts.hour === hour)} onClick={() => select({ hour })}>{String(hour).padStart(2, '0')}</button>)}</div></div>
        <div><p className="mb-2 text-center text-xs text-muted-foreground">Minute</p><div ref={scrollToSelected} role="group" aria-label="Minute" className="relative max-h-48 space-y-1 overflow-y-auto">{Array.from({ length: 60 }, (_, minute) => <button key={minute} type="button" aria-pressed={!!value && parts.minute === minute} className={optionClass(!!value && parts.minute === minute)} onClick={() => select({ minute })}>{String(minute).padStart(2, '0')}</button>)}</div></div>
        <div><p className="mb-2 text-center text-xs text-muted-foreground">AM/PM</p><div role="group" aria-label="AM or PM" className="space-y-1">{(['AM', 'PM'] as const).map(period => <button key={period} type="button" aria-pressed={!!value && parts.period === period} className={optionClass(!!value && parts.period === period)} onClick={() => select({ period })}>{period}</button>)}</div></div>
      </div>
      <button type="button" onClick={close} className="mt-3 h-9 w-full rounded bg-primary text-sm text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Done</button>
    </div>}
  </div>;
}

export function OpeningDatePicker({
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
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const calendarId = useId();
  // Date-only values must use local midnight, rather than UTC parsing.
  const minimum = min ? new Date(`${min}T00:00:00`) : undefined;
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  const outOfRange = !!value && !!min && value < min;

  function close() {
    setOpen(false);
    onBlur?.();
    trigger.current?.focus();
  }

  return (
    <div
      className="min-w-0 space-y-2"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label="Choose promised date"
        aria-expanded={open}
        aria-controls={calendarId}
        aria-invalid={invalid || outOfRange}
        onClick={() => (open ? close() : setOpen(true))}
        onBlur={onBlur}
        className={`${openingInput} flex items-center justify-between gap-2 text-left`}
      >
        <span className={value ? "" : "text-muted-foreground"}>
          {value ? formatDate(`${value}T00:00:00`) : "dd/mm/yyyy"}
        </span>
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div
          id={calendarId}
          role="region"
          aria-label="Promised date calendar"
          className="rounded-lg border border-border bg-background p-3"
        >
          <DayPicker
            mode="single"
            autoFocus
            selected={outOfRange ? undefined : selected}
            defaultMonth={outOfRange ? minimum : (selected ?? minimum)}
            startMonth={minimum}
            disabled={minimum ? { before: minimum } : undefined}
            onSelect={(date) => {
              if (!date || (minimum && date < minimum)) return;
              onChange(localDate(date));
              close();
            }}
            className="relative mx-auto w-fit"
            classNames={{
              month: "space-y-3",
              month_caption:
                "flex h-8 items-center justify-center px-10 text-sm font-medium",
              nav: "absolute inset-x-0 top-0 flex justify-between",
              button_previous:
                "flex h-8 w-8 items-center justify-center rounded hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40",
              button_next:
                "flex h-8 w-8 items-center justify-center rounded hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40",
              chevron: "h-4 w-4 fill-current",
              weekday: "h-8 w-9 text-xs font-medium text-muted-foreground",
              day: "h-9 w-9 p-0 text-center text-sm",
              day_button:
                "h-9 w-9 rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:hover:bg-transparent",
              selected:
                "rounded bg-primary text-primary-foreground [&>button]:hover:bg-primary",
              today: "font-semibold underline",
              outside: "text-muted-foreground",
              disabled: "text-muted-foreground opacity-40",
            }}
          />
          {min && (
            <p className="mt-2 text-xs text-muted-foreground">
              Earliest promised date: {formatDate(`${min}T00:00:00`)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
