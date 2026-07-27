"use client";

import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DataTableSearchHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  onCommitSearch: () => void;
  onClearSearch: () => void;
  placeholder?: string;
  isLoading?: boolean;
  isFetching?: boolean;
  children?: React.ReactNode;
}

export function DataTableSearchHeader({
  search,
  onSearchChange,
  onCommitSearch,
  onClearSearch,
  placeholder = "Search...",
  isLoading = false,
  isFetching = false,
  children,
}: DataTableSearchHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex flex-1 gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder={placeholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCommitSearch()}
          />
          {search && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={onClearSearch}
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          onClick={onCommitSearch}
          disabled={isLoading || isFetching}
        >
          Search
        </Button>
      </div>
      {children}
    </div>
  );
}
