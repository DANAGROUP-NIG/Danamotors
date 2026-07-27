"use client";

interface DataTableEmptyStateProps {
  colSpan: number;
  searchQuery?: string;
  entityName?: string;
}

export function DataTableEmptyState({
  colSpan,
  searchQuery,
  entityName = "items",
}: DataTableEmptyStateProps) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-12 text-center text-sm text-muted-foreground"
      >
        {searchQuery
          ? `No ${entityName} matching "${searchQuery}"`
          : `No ${entityName} yet.`}
      </td>
    </tr>
  );
}
