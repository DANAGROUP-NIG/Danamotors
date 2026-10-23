"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { useSaleCustomers } from "../hooks/use-part-sale";
import { customerAddress, customerName, fmtCurrency } from "../lib/part-sale-format";
import type { CustomerSearchResult, SaleCustomer } from "../types/part-sale.types";

interface CustomerPickerProps {
  value: SaleCustomer | null;
  onChange: (customer: CustomerSearchResult | null) => void;
  disabled?: boolean;
}

/** Search any party by code, name or phone. Shows the address and current outstanding, like the legacy form. */
export function CustomerPicker({ value, onChange, disabled }: CustomerPickerProps) {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const { data, isFetching } = useSaleCustomers(debounced);
  const results = debounced.length >= 2 ? (data ?? []) : [];

  if (value) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-slate-800">
            {value.code && <span className="mr-2 font-mono text-slate-500">{value.code}</span>}
            {customerName(value)}
          </p>
          <p className="truncate text-slate-500">{customerAddress(value) || "No address on file"}</p>
          {value.phoneNumber && <p className="text-slate-500">{value.phoneNumber}</p>}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            aria-label="Change customer"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className={cn(inputCls, "pl-9")}
          value={text}
          disabled={disabled}
          placeholder="Search customer code, name or phone…"
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && debounced.length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-background shadow-lg">
          {results.length === 0 && !isFetching ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">No customers match “{debounced}”.</p>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange(c);
                  setText("");
                  setDebounced("");
                  setOpen(false);
                }}
              >
                <span className="min-w-0">
                  <span className="block font-medium">
                    {c.code && <span className="mr-2 font-mono text-muted-foreground">{c.code}</span>}
                    {c.name}
                  </span>
                  <span className="block truncate text-muted-foreground">{customerAddress(c) || c.phoneNumber || "—"}</span>
                </span>
                <span className="shrink-0 text-right text-sm">
                  <span className={cn("block", c.outstanding > 0 ? "font-medium text-amber-700" : "text-muted-foreground")}>
                    {fmtCurrency(c.outstanding)}
                  </span>
                  <span className="block text-muted-foreground">outstanding</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
