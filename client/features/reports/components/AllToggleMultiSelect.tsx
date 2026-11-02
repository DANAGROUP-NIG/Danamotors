"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LookupOption } from "../types";

interface AllToggleMultiSelectProps {
  label: string;
  /** e.g. "All models" */
  allLabel: string;
  /** undefined = All (filter off). */
  value: string[] | undefined;
  onChange: (value: string[] | undefined) => void;
  options: LookupOption[];
  isLoading?: boolean;
  isError?: boolean;
}

/**
 * Legacy "dropdown + All checkbox" filter. All is on by default and disables the dropdown;
 * unticking it allows one or more values to be picked.
 */
export function AllToggleMultiSelect({ label, allLabel, value, onChange, options, isLoading, isError }: AllToggleMultiSelectProps) {
  const id = useId();
  const all = value === undefined;
  const selected = useMemo(() => new Set(value ?? []), [value]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? options.filter((option) => `${option.label} ${option.code ?? ""}`.toLowerCase().includes(term)) : options;
  }, [options, search]);
  const names = useMemo(() => new Map(options.map((option) => [option.id, option.label])), [options]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    searchInput.current?.focus();
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id, open]);

  function toggleAll(checked: boolean) {
    if (checked) {
      onChange(undefined);
      setOpen(false);
    } else {
      onChange([]);
      setOpen(true);
    }
  }

  function toggle(optionId: string) {
    const next = new Set(selected);
    if (next.has(optionId)) next.delete(optionId);
    else next.add(optionId);
    onChange(Array.from(next));
  }

  function onListKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, visible.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && visible[active]) {
      event.preventDefault();
      toggle(visible[active].id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
  }

  const chips = (value ?? []).slice(0, 2);
  const more = (value?.length ?? 0) - chips.length;

  return (
    <div ref={root} className="relative grid min-w-0 gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span id={`${id}-label`} className="text-sm font-semibold">{label}</span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={all}
            onChange={(event) => toggleAll(event.target.checked)}
            className="size-4 cursor-pointer rounded border-border accent-[var(--primary)]"
            aria-label={`All ${label.toLowerCase()}`}
          />
          All
        </label>
      </div>

      <button
        ref={trigger}
        type="button"
        disabled={all}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label`}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-10 w-full min-w-0 items-center gap-1.5 rounded-md border border-border px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
          all ? "cursor-not-allowed bg-muted/60 text-muted-foreground" : "bg-background",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {all ? (
            <span className="truncate">{allLabel}</span>
          ) : chips.length === 0 ? (
            <span className="truncate text-muted-foreground">Select…</span>
          ) : (
            <>
              {chips.map((chip) => (
                <span key={chip} className="inline-flex max-w-[9rem] shrink-0 items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs">
                  <span className="truncate">{names.get(chip) ?? "…"}</span>
                  <X
                    className="size-3 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${names.get(chip) ?? "value"}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(chip);
                    }}
                  />
                </span>
              ))}
              {more > 0 && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">+{more}</span>}
            </>
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && !all && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-border bg-white p-2 shadow-lg" onKeyDown={onListKey}>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInput}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setActive(0);
              }}
              placeholder={`Search ${label.toLowerCase()}…`}
              aria-label={`Search ${label.toLowerCase()}`}
              aria-controls={`${id}-list`}
              aria-activedescendant={visible[active] ? `${id}-opt-${active}` : undefined}
              className="h-9 w-full rounded-md border border-border pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <ul id={`${id}-list`} role="listbox" aria-multiselectable="true" aria-labelledby={`${id}-label`} className="max-h-60 overflow-y-auto">
            {isLoading ? (
              <li className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</li>
            ) : isError ? (
              <li className="px-2 py-2 text-sm text-destructive">Options could not be loaded.</li>
            ) : visible.length === 0 ? (
              <li className="px-2 py-2 text-sm text-muted-foreground">No matches</li>
            ) : (
              visible.map((option, index) => {
                const isSelected = selected.has(option.id);
                return (
                  <li
                    key={option.id}
                    id={`${id}-opt-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggle(option.id)}
                    onMouseEnter={() => setActive(index)}
                    className={cn("flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm", index === active && "bg-muted")}
                  >
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", isSelected ? "border-primary bg-primary text-white" : "border-border")}>
                      {isSelected && <Check className="size-3" />}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate", !option.active && "text-muted-foreground")}>
                      {option.label}
                      {!option.active && " (inactive)"}
                    </span>
                    {option.code && <span className="shrink-0 font-mono text-xs text-muted-foreground">{option.code}</span>}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
