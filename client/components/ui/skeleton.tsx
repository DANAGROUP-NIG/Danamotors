import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Decorative placeholders inherit the theme and stop animating for reduced motion. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} aria-hidden="true" className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)} />;
}
export function LoadingRegion({ children, label = "Loading content", className }: { children: ReactNode; label?: string; className?: string }) {
  return <div role="status" aria-busy="true" className={cn("min-w-0", className)}><span className="sr-only">{label}</span><div aria-hidden="true">{children}</div></div>;
}
