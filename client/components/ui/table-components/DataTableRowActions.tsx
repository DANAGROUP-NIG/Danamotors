"use client";

import { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu, ActionMenuDivider } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { cn } from "@/lib/utils";

export interface RowAction<T> {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  onClick: (item: T) => void;
}

type MaybeAction<T> = RowAction<T> | false | null | undefined;

interface DataTableRowActionsProps<T> {
  item: T;
  actions: MaybeAction<T>[];
  quickActions?: MaybeAction<T>[];
  className?: string;
}

function isAction<T>(value: MaybeAction<T>): value is RowAction<T> {
  return Boolean(value);
}

export function DataTableRowActions<T>({
  item,
  actions,
  quickActions,
  className,
}: DataTableRowActionsProps<T>) {
  const visibleQuick = (quickActions ?? [])
    .filter(isAction)
    .filter((a) => !a.hidden && !a.destructive);
  const visibleMenu = actions.filter(isAction).filter((a) => !a.hidden);

  return (
    <div
      className={cn(
        "flex items-center justify-end gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover/row:opacity-100",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {visibleQuick.map((action) => (
        <Button
          key={action.id}
          size="sm"
          variant="ghost"
          aria-label={String(action.label)}
          disabled={action.disabled}
          onClick={() => action.onClick(item)}
          className={cn(
            "h-8 w-8 p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            action.destructive && "hover:text-red-600",
          )}
        >
          {action.icon}
        </Button>
      ))}

      {visibleMenu.length > 0 && (
        <ActionMenu
          align="end"
          trigger={
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Open actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          }
        >
          {visibleMenu.map((action, index) => {
            const prev = visibleMenu[index - 1];
            const showDivider =
              prev &&
              ((action.destructive && !prev.destructive) ||
                (!action.destructive && prev.destructive));

            return (
              <div key={action.id}>
                {showDivider && <ActionMenuDivider />}
                <ActionMenuItem
                  icon={action.icon}
                  shortcut={action.shortcut}
                  destructive={action.destructive}
                  disabled={action.disabled}
                  onClick={() => action.onClick(item)}
                >
                  {action.label}
                </ActionMenuItem>
              </div>
            );
          })}
        </ActionMenu>
      )}
    </div>
  );
}
