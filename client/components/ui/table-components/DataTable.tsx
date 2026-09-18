"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTablePagination } from "./DataTablePagination";
import { DataTableEmptyState } from "./DataTableEmptyState";

export interface Column<T> {
  header: ReactNode;
  render: (item: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface DataTableSelectionConfig {
  selectedIds: Set<string>;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  onToggleAll: () => void;
  onToggle: (id: string) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  isFetching?: boolean;
  emptyMessage?: string;
  searchQuery?: string;
  rowKey: (item: T) => string | number;
  skeletonRowCount?: number;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  children?: ReactNode;
  selection?: DataTableSelectionConfig;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  isFetching,
  emptyMessage,
  searchQuery,
  rowKey,
  skeletonRowCount = 5,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  children,
  selection,
}: DataTableProps<T>) {
  const isEmpty = !isLoading && data.length === 0;
  const effectiveColumns = selection
    ? [selectionColumn<T>(selection, rowKey), ...columns]
    : columns;

  return (
    <div className="grid gap-4">
      {children}

      <div className="overflow-hidden rounded-xl border border-[#e8edf3] bg-white shadow-sm transition-shadow hover:shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e8edf3] bg-[#f8fafc]">
              <tr>
                {effectiveColumns.map((col, i) => (
                  <th
                    key={i}
                    className={cn(
                      "px-4 py-3 text-left text-xs font-semibold text-muted-foreground",
                      col.headerClassName,
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows count={skeletonRowCount} columns={effectiveColumns.length} />
              ) : isEmpty ? (
                <DataTableEmptyState
                  colSpan={effectiveColumns.length}
                  searchQuery={searchQuery}
                  message={emptyMessage}
                />
              ) : (
                data.map((item) => {
                  const id = String(rowKey(item));
                  return (
                    <tr
                      key={id}
                      className="group/row border-t border-border transition-all duration-150 hover:bg-muted/30 hover:shadow-[inset_0_0_0_1px_rgba(5,20,31,0.04)]"
                    >
                      {effectiveColumns.map((col, i) => (
                        <td key={i} className={cn("px-4 py-3", col.className)}>
                          {col.render(item)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {page != null && pageSize != null && total != null && totalPages != null && onPageChange && total > pageSize && (
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            isFetching={isFetching}
            onPageChange={onPageChange}
          />
        )}
      </div>
    </div>
  );
}

function selectionColumn<T>(
  selection: DataTableSelectionConfig,
  rowKey: (item: T) => string | number,
): Column<T> {
  return {
    header: (
      <Checkbox
        checked={selection.isAllSelected}
        indeterminate={selection.isIndeterminate}
        onCheckedChange={selection.onToggleAll}
        aria-label="Select all rows"
      />
    ),
    headerClassName: "w-10 text-center",
    className: "w-10 text-center align-middle",
    render: (item: T) => {
      const id = String(rowKey(item));
      return (
        <Checkbox
          checked={selection.selectedIds.has(id)}
          onCheckedChange={() => selection.onToggle(id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select row ${id}`}
        />
      );
    },
  };
}

function SkeletonRows({ count, columns }: { count: number; columns: number }) {
  const widths = ["60%", "75%", "45%", "55%", "70%", "50%", "65%", "40%"];
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="border-t border-border">
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="h-4 animate-pulse rounded bg-muted"
                style={{ width: widths[j % widths.length] }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
