"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { useIndentPartSearch } from "../hooks/use-indents";
import type { PartSearchResult } from "../types/indent.types";

interface PartPickerProps {
  requestingBranchId?: string;
  sourceBranchId?: string;
  onSelect: (part: PartSearchResult) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Search-as-you-type part selector showing stock at both branches. */
export function PartPicker({ requestingBranchId, sourceBranchId, onSelect, placeholder, disabled }: PartPickerProps) {
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

  const { data, isFetching } = useIndentPartSearch({ search: debounced, requestingBranchId, sourceBranchId });
  const results = debounced.length >= 2 ? (data ?? []) : [];

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className={cn(inputCls, "pl-9")}
          value={text}
          disabled={disabled}
          placeholder={placeholder ?? "Search part number or name…"}
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
            <p className="px-3 py-3 text-sm text-muted-foreground">No active parts match “{debounced}”.</p>
          ) : (
            results.map((part) => (
              <button
                key={part.id}
                type="button"
                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onSelect(part);
                  setText("");
                  setDebounced("");
                  setOpen(false);
                }}
              >
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-medium">{part.partNumber}</span>
                  <span className="block truncate text-muted-foreground">
                    {part.name}
                    {part.priceCategoryCode ? ` · Cat. ${part.priceCategoryCode}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className={cn("block font-medium", part.sourceAvailable > 0 ? "text-emerald-700" : "text-red-600")}>
                    {part.sourceAvailable} available
                  </span>
                  <span className="block text-muted-foreground">{part.requestingStock} in your stock</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
