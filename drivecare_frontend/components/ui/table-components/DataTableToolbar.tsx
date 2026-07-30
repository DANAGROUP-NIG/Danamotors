"use client";

import { ReactNode } from "react";
import { DataTableSearch } from "./DataTableSearch";

interface DataTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onClearSearch: () => void;
  placeholder?: string;
  isLoading?: boolean;
  isFetching?: boolean;
  filters?: ReactNode;
}

export function DataTableToolbar({
  search,
  onSearchChange,
  onSearch,
  onClearSearch,
  placeholder,
  isLoading,
  isFetching,
  filters,
}: DataTableToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <DataTableSearch
        value={search}
        onChange={onSearchChange}
        onSearch={onSearch}
        onClear={onClearSearch}
        placeholder={placeholder}
      />
      {filters}
    </div>
  );
}
