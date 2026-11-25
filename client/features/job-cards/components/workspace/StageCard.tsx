import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The plain card every section of the job card sits in. */
export function StageCard({
  title,
  description,
  actions,
  children,
  id,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const titleId = useId();
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn("min-w-0 scroll-mt-40 space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** A read-only list of labelled facts. */
export function DetailList({ rows, className }: { rows: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2", className)}>
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
