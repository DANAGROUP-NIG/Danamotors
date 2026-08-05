"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DataTablePagination } from "./DataTablePagination";
import { DataTableEmptyState } from "./DataTableEmptyState";

export interface Column<T> {
  header: string;
  render: (item: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  isFetching?: boolean;
  emptyMessage?: string;
  searchQuery?: string;
  rowKey: (item: T) => string | number;
  onRowClick?: (item: T) => void;
  skeletonRowCount?: number;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  children?: ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  isFetching,
  emptyMessage,
  searchQuery,
  rowKey,
  onRowClick,
  skeletonRowCount = 5,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  children,
}: DataTableProps<T>) {
  const isEmpty = !isLoading && data.length === 0;

  return (
    <div className="grid gap-4">
      {children}

      <div className="overflow-hidden rounded-xl border border-[#e8edf3] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e8edf3] bg-[#f8fafc]">
              <tr>
                {columns.map((col, i) => (
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
                <SkeletonRows count={skeletonRowCount} columns={columns.length} />
              ) : isEmpty ? (
                <DataTableEmptyState
                  colSpan={columns.length}
                  searchQuery={searchQuery}
                  message={emptyMessage}
                />
              ) : (
                data.map((item) => (
                  <tr
                    key={rowKey(item)}
                    className={cn(
                      "border-t border-border transition-colors hover:bg-muted/30",
                      onRowClick && "cursor-pointer",
                    )}
                    onClick={onRowClick ? () => onRowClick(item) : undefined}
                  >
                    {columns.map((col, i) => (
                      <td key={i} className={cn("px-4 py-3", col.className)}>
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
                ))
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
