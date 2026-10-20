import { cn } from "@/lib/utils";
import { LoadingRegion, Skeleton } from "./skeleton";

type Variant = "detail" | "list" | "form" | "dashboard" | "workspace";
const card = "min-w-0 rounded-xl border border-border bg-card p-5 shadow-sm";
function HeaderSkeleton() {
  return <div className="flex flex-wrap items-center justify-between gap-4"><div className="space-y-3"><Skeleton className="h-3 w-28" /><Skeleton className="h-8 w-52 max-w-full" /><Skeleton className="h-4 w-40" /></div><Skeleton className="h-10 w-28 rounded-lg" /></div>;
}
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="divide-y divide-border">{Array.from({ length: rows }, (_, index) => <div key={index} className="flex items-center gap-4 py-4"><Skeleton className="size-10 shrink-0 rounded-xl" /><div className="min-w-0 flex-1 space-y-2"><Skeleton className={index % 2 ? "h-4 w-2/3" : "h-4 w-1/2"} /><Skeleton className="h-3 w-1/3" /></div><Skeleton className="h-6 w-16 rounded-full" /></div>)}</div>;
}
function FieldsSkeleton() {
  return <div className="grid gap-6 sm:grid-cols-2">{Array.from({ length: 6 }, (_, index) => <div key={index} className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-full rounded-lg" /></div>)}</div>;
}
export function LoadingSkeleton({ variant = "detail", label = "Loading content", className, compact = false }: { variant?: Variant; label?: string; className?: string; compact?: boolean }) {
  return <LoadingRegion label={label} className={cn(!compact && "p-4 lg:p-6", className)}><div className="space-y-6">
    {!compact && <HeaderSkeleton />}
    {variant === "dashboard" ? <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className={card}><Skeleton className="mb-5 size-10 rounded-xl" /><Skeleton className="mb-3 h-3 w-24" /><Skeleton className="h-8 w-28" /><Skeleton className="mt-5 h-3 w-2/3" /></div>)}</div>
      <div className="grid gap-5 lg:grid-cols-3"><div className={cn(card, "lg:col-span-2")}><Skeleton className="mb-8 h-5 w-40" /><div className="flex h-52 items-end gap-3 border-b border-border px-2">{["h-2/5", "h-3/5", "h-1/2", "h-4/5", "h-3/5", "h-full", "h-4/5"].map((height, index) => <Skeleton key={index} className={cn("flex-1 rounded-t-lg rounded-b-none", height)} />)}</div></div><div className={card}><Skeleton className="mb-4 h-5 w-32" /><ListSkeleton rows={3} /></div></div>
    </> : variant === "form" ? <FieldsSkeleton /> : variant === "list" ? <div className={compact ? undefined : card}><ListSkeleton /></div> : <>
      {variant === "workspace" && <div className={cn(card, "flex gap-5 overflow-hidden")}>{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-8 min-w-20 flex-1 rounded-full" />)}</div>}
      <div className={card}><div className="mb-6 flex flex-wrap items-center justify-between gap-4"><Skeleton className="h-6 w-44" /><Skeleton className="h-7 w-28 rounded-full" /></div>{variant === "workspace" ? <><Skeleton className="mb-4 h-12 w-52" /><Skeleton className="mb-6 h-4 w-48" /><Skeleton className="h-20 w-full rounded-xl" /><ListSkeleton rows={5} /><div className="mt-5 flex flex-wrap gap-3"><Skeleton className="h-11 w-48" /><Skeleton className="h-11 w-32" /></div></> : <FieldsSkeleton />}</div>
      {variant === "detail" && <div className={card}><Skeleton className="mb-3 h-5 w-36" /><ListSkeleton rows={3} /></div>}
    </>}
  </div></LoadingRegion>;
}
export function TableSkeleton({ rows = 5, columns = 4, label = "Loading records" }: { rows?: number; columns?: number; label?: string }) {
  return <LoadingRegion label={label}><div className="overflow-hidden rounded-xl border border-border bg-card"><table className="w-full"><tbody><SkeletonRows count={rows} columns={columns} /></tbody></table></div></LoadingRegion>;
}
export function SkeletonRows({ count, columns }: { count: number; columns: number }) {
  const widths = ["w-3/5", "w-3/4", "w-1/2", "w-2/3"];
  return <>{Array.from({ length: count }, (_, row) => <tr key={row} aria-hidden="true" className="border-t border-border">{Array.from({ length: columns }, (_, column) => <td key={column} className="px-4 py-4"><Skeleton className={cn("h-4", widths[(row + column) % widths.length])} /></td>)}</tr>)}</>;
}
