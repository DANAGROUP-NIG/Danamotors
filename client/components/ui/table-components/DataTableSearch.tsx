"use client";

import { Search, X } from "lucide-react";

interface DataTableSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  onClear: () => void;
  placeholder?: string;
}

export function DataTableSearch({
  value,
  onChange,
  onSearch,
  onClear,
  placeholder = "Search...",
}: DataTableSearchProps) {
  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onSearch();
        }}
      />
      {value && (
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={onClear}
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
