"use client";

import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pluralize } from "@/lib/table-actions";

export interface BulkAction<T> {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  variant?: "default" | "outline" | "ghost" | "destructive";
  disabled?: boolean;
  hidden?: boolean;
  onClick: (items: T[]) => void;
}

type MaybeBulkAction<T> = BulkAction<T> | false | null | undefined;

interface DataTableBulkToolbarProps<T> {
  selectedCount: number;
  totalCount: number;
  selectedItems: T[];
  actions: MaybeBulkAction<T>[];
  onClear: () => void;
  className?: string;
}

function isBulkAction<T>(value: MaybeBulkAction<T>): value is BulkAction<T> {
  return Boolean(value);
}

export function DataTableBulkToolbar<T>({
  selectedCount,
  totalCount,
  selectedItems,
  actions,
  onClear,
  className,
}: DataTableBulkToolbarProps<T>) {
  const visibleActions = actions.filter(isBulkAction).filter((a) => !a.hidden);

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/10 bg-primary px-3 py-2.5 shadow-lg shadow-primary/10",
            className,
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-white">
              {selectedCount}
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">
                {pluralize(selectedCount, "item")} selected
              </p>
              <p className="text-xs text-white/70">
                of {totalCount} total
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {visibleActions.map((action) => (
              <Button
                key={action.id}
                type="button"
                size="sm"
                variant={action.variant ?? "ghost"}
                disabled={action.disabled}
                onClick={() => action.onClick(selectedItems)}
                className={cn(
                  "h-8 gap-1.5 text-xs font-semibold",
                  action.variant === "ghost" &&
                    "bg-white/10 text-white hover:bg-white/20 hover:text-white",
                  action.variant === "default" &&
                    "bg-white text-primary hover:bg-white/90",
                  action.variant === "outline" &&
                    "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white",
                  action.variant === "destructive" &&
                    "bg-red-500 text-white hover:bg-red-600",
                )}
              >
                {action.icon && (
                  <span className="[&_svg]:size-3.5">{action.icon}</span>
                )}
                {action.label}
              </Button>
            ))}

            <div className="mx-1 h-5 w-px bg-white/20" />

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onClear}
              className="h-8 w-8 p-0 text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Clear selection"
            >
              <X className="size-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
