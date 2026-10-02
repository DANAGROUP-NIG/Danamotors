"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { apiGet } from "@/lib/api/apiClient";
import { inputCls } from "@/components/forms/FormField";

export type PickerRecord = {
  id: string;
  code?: string | null;
  description?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string | null;
  phoneNumber?: string;
  registrationNumber?: string | null;
  vin?: string;
  jobNumber?: string;
  scheduledAt?: string;
  customerId?: string | null;
  customer?: {
    id: string;
    firstName?: string;
    lastName?: string;
  } | null;
  vehicleId?: string;
  vehicle?: {
    registrationNumber?: string | null;
    vin?: string;
  } | null;
  branch?: {
    name: string;
  };
  name?: string;
  category?: string | null;
  durationMins?: number | null;
  price?: number;
  serviceId?: string | null;
  parentId?: string | null;
  currency?: string;
  lines?: { type: string; description: string; amount: number }[];
  jobCard?: {
    jobNumber: string;
    customer?: { id: string };
    vehicle?: { id: string };
    branch?: { name: string };
  };
};

export function recordLabel(row: PickerRecord) {
  if (row.scheduledAt)
    return `${new Date(row.scheduledAt).toLocaleString()} | ${row.vehicle?.registrationNumber || row.vehicle?.vin || "Booking"}`;

  return (
    row.registrationNumber ||
    row.vin ||
    row.jobNumber ||
    row.companyName ||
    [row.firstName, row.lastName].filter(Boolean).join(" ") ||
    [row.code, row.description].filter(Boolean).join(" | ") ||
    row.name ||
    row.id
  );
}

function recordHint(row: PickerRecord) {
  if (row.vin && row.registrationNumber) return row.vin;

  if (row.price != null || row.durationMins != null) {
    return [
      row.description,
      row.category,
      row.durationMins != null ? `${row.durationMins} min` : null,
      row.price != null ? `NGN ${row.price.toLocaleString()}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
  }

  return [row.code, row.phoneNumber].filter(Boolean).join(" | ");
}

export function WorkshopPicker({
  label,
  endpoint,
  collection,
  value,
  onChange,
  onSelect,
  disabled,
  required = false,
  selectedRecord,
  error,
  onBlur,
  onCustom,
}: {
  label: string;
  endpoint: string;
  collection: string;
  value?: string;
  onChange: (id: string) => void;
  onSelect?: (row: PickerRecord) => void;
  disabled?: boolean;
  required?: boolean;
  selectedRecord?: PickerRecord;
  error?: string;
  onBlur?: () => void;
  onCustom?: (code: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    if (open && active >= 0)
      document.getElementById(`${id}-option-${active}`)?.scrollIntoView({
        block: "nearest",
      });
  }, [active, open, id]);

  const [chosen, setChosen] = useState<PickerRecord>();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setActive(-1);
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  const query = useQuery({
    queryKey: ["workshop-picker", endpoint, debouncedSearch],

    queryFn: () =>
      apiGet<Record<string, PickerRecord[]>>(
        `${endpoint}${endpoint.includes("?") ? "&" : "?"}limit=50&search=${encodeURIComponent(debouncedSearch)}`,
      ),

    enabled: !disabled && (open || !!value),
    staleTime: 30_000,
  });

  const rows = query.data?.[collection] ?? [];
  const selectedId = value === undefined ? chosen?.id : value;
  const selected =
    selectedRecord?.id === selectedId
      ? selectedRecord
      : (rows.find((row) => row.id === selectedId) ??
        (chosen?.id === selectedId ? chosen : undefined));
  const loading = query.isFetching || search !== debouncedSearch;

  const choose = (row: PickerRecord) => {
    setChosen(row);
    onChange(row.id);
    onSelect?.(row);
    setOpen(false);
    setSearch("");
    setActive(-1);
    input.current?.focus();
  };

  return (
    <div
      className="relative min-w-0 space-y-1.5"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setSearch("");
          onBlur?.();
        }
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && (
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-autocomplete="list"
          aria-required={required}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-activedescendant={
            open && active >= 0 && rows[active]
              ? `${id}-option-${active}`
              : undefined
          }
          autoComplete="off"
          disabled={disabled}
          className={`${inputCls} rounded-lg pl-9 pr-16 ${error ? "border-destructive" : ""}`}
          value={
            open
              ? search
              : selected
                ? recordLabel(selected)
                : selectedId
                  ? query.isFetching
                    ? "Loading selection..."
                    : "Selected record - search to change"
                  : ""
          }
          placeholder={
            open
              ? `Search ${label.toLowerCase()}...`
              : `Select ${label.toLowerCase()}`
          }
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((current) =>
                Math.max(
                  0,
                  Math.min(
                    rows.length - 1,
                    current + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            } else if (event.key === "Enter" && open) {
              event.preventDefault();

              if (!loading && active >= 0 && rows[active]) choose(rows[active]);
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setSearch("");
            }
          }}
        />
        <div className="absolute right-2 top-2 flex items-center gap-1">
          {selectedId && !disabled && (
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label={`Clear ${label}`}
              onClick={() => {
                setChosen(undefined);
                onChange("");
                setSearch("");
                input.current?.focus();
              }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {loading && open ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Open ${label} options`}
              disabled={disabled}
              onClick={() => {
                input.current?.focus();
                setOpen(true);
              }}
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
      {open && !disabled && (
        <div className="absolute z-30 w-full overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
          {loading && (
            <p
              role="status"
              className="px-3 py-2 text-sm text-muted-foreground"
            >
              Searching...
            </p>
          )}
          {query.isError && (
            <p role="alert" className="p-3 text-sm text-destructive">
              Could not load options.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => query.refetch()}
              >
                Retry
              </button>
            </p>
          )}
          <ul
            id={`${id}-options`}
            role="listbox"
            aria-label={label}
            className="max-h-56 overflow-y-auto overscroll-contain p-1"
          >
            {!loading && !query.isError && !rows.length && (
              <li
                role="presentation"
                className="p-3 text-sm text-muted-foreground"
              >
                No matching records. Try another search.
              </li>
            )}
            {!query.isError &&
              rows.map((row, index) => (
                <li
                  key={row.id}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={selectedId === row.id}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${active === index || selectedId === row.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActive(index)}
                  onClick={() => {
                    if (!loading) choose(row);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block break-words font-medium">
                      {recordLabel(row)}
                    </span>
                    {recordHint(row) && (
                      <span className="block text-sm text-muted-foreground">
                        {recordHint(row)}
                      </span>
                    )}
                  </span>
                  {selectedId === row.id && (
                    <Check className="h-4 w-4 shrink-0" />
                  )}
                </li>
              ))}
          </ul>
          {onCustom && search.trim() && !loading && (
            <button
              type="button"
              className="w-full border-t px-3 py-3 text-left text-sm font-medium text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCustom(search.trim().toUpperCase());
                setOpen(false);
                setSearch("");
                input.current?.focus();
              }}
            >
              Use code &quot;{search.trim().toUpperCase()}&quot;
            </button>
          )}
          {rows.length === 50 && (
            <p className="border-t px-3 py-2 text-sm text-muted-foreground">
              Showing 50 results. Search to narrow the list.
            </p>
          )}
        </div>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
