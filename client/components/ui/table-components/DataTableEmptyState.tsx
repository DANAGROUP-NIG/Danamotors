"use client";

interface DataTableEmptyStateProps {
  colSpan: number;
  searchQuery?: string;
  entityName?: string;
  message?: string;
}

export function DataTableEmptyState({
  colSpan,
  searchQuery,
  entityName = "items",
  message,
}: DataTableEmptyStateProps) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-12 text-center text-sm text-muted-foreground"
      >
        {message ?? (searchQuery
          ? `No ${entityName} matching "${searchQuery}"`
          : `No ${entityName} yet.`)}
      </td>
    </tr>
  );
}
