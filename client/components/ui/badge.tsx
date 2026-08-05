import * as React from "react";

import { cn } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "blue" | "green" | "amber" | "neutral";
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
        tone === "blue" && "border-blue-200 bg-blue-50 text-blue-700",
        tone === "green" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "amber" && "border-amber-200 bg-amber-50 text-amber-700",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
