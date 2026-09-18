"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ActionMenuItemProps {
  children: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  asChild?: boolean;
}

export function ActionMenuItem({
  children,
  icon,
  shortcut,
  destructive,
  disabled,
  onClick,
  className,
  asChild,
}: ActionMenuItemProps) {
  if (asChild) {
    return (
      <div className={cn("px-1", className)}>
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        destructive
          ? "text-red-600 hover:bg-red-50"
          : "text-foreground hover:bg-muted",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {icon && <span className="flex shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && (
        <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
