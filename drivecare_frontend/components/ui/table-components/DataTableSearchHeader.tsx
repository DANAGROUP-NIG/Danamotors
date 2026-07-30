"use client";

import { DataTableToolbar } from "./DataTableToolbar";

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

export function DataTableSearchHeader(props: DataTableSearchHeaderProps) {
  const { children, onCommitSearch, ...rest } = props;
  return (
    <DataTableToolbar {...rest} onSearch={onCommitSearch} filters={children} />
  );
}
