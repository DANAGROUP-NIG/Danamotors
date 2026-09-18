"use client";

import { useState, useCallback, useMemo } from "react";

export interface UseDataTableSelectionOptions<T> {
  data: T[];
  rowKey: (item: T) => string | number;
}

export interface UseDataTableSelectionResult<T> {
  selectedIds: Set<string>;
  selectedItems: T[];
  isSelected: (id: string) => boolean;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  selectItems: (items: T[]) => void;
  clear: () => void;
}

export function useDataTableSelection<T>({
  data,
  rowKey,
}: UseDataTableSelectionOptions<T>): UseDataTableSelectionResult<T> {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allIds = useMemo(
    () => data.map((item) => String(rowKey(item))),
    [data, rowKey],
  );

  const selectedItems = useMemo(
    () => data.filter((item) => selectedIds.has(String(rowKey(item)))),
    [data, selectedIds, rowKey],
  );

  const isAllSelected = allIds.length > 0 && selectedIds.size === allIds.length;
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === allIds.length && allIds.length > 0) return new Set();
      return new Set(allIds);
    });
  }, [allIds]);

  const selectItems = useCallback((items: T[]) => {
    setSelectedIds(new Set(items.map((item) => String(rowKey(item)))));
  }, [rowKey]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return {
    selectedIds,
    selectedItems,
    isSelected,
    isAllSelected,
    isIndeterminate,
    onToggle: toggle,
    onToggleAll: toggleAll,
    selectItems,
    clear,
  };
}
