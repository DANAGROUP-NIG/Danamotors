import Image from "next/image";
import type { ReactNode } from "react";
import { Square, SquareCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PrintRow, SignatureBoxView } from "../../lib/job-print.logic";

/** The company letterhead used on every printed job document: company name and the branch line. */
export function Letterhead({ company, branch, children }: { company: string; branch: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-primary pb-2">
      <div className="min-w-0">
        <p className="text-xl font-bold text-primary">{company}</p>
        <p className="text-xs text-muted-foreground">{branch}</p>
      </div>
      {children}
    </header>
  );
}

/** A boxed section with the navy title bar of the paper form. Never split across two printed pages. */
export function PrintSection({
  title,
  hint,
  className,
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("print-keep flex min-w-0 flex-col border border-foreground/40", className)} aria-label={title}>
      <h2 className="bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
        {title}
        {hint && <span className="font-normal"> ({hint})</span>}
      </h2>
      <div className="flex-1 px-2 py-1 text-xs">{children}</div>
    </section>
  );
}

/** Label and value pairs in two columns, as on the paper form's detail boxes. */
export function FieldList({ rows, className }: { rows: PrintRow[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5", className)}>
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="font-medium text-muted-foreground">{row.label}:</dt>
          <dd className="min-w-0 break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A printed tick box: ticked or empty, drawn with the icon set so it prints as a box. */
export function TickBox({ ticked, label }: { ticked: boolean; label?: string }) {
  const Icon = ticked ? SquareCheck : Square;
  return <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-label={label ?? (ticked ? "Ticked" : "Not ticked")} role="img" />;
}

/**
 * One of the paper form's signature boxes: the statement, the captured signature or a blank line,
 * then the printed name and date, or blank lines to fill in by hand.
 */
export function SignatureBox({ box }: { box: SignatureBoxView }) {
  return (
    <section className="print-keep flex min-w-0 flex-col border border-foreground/40" aria-label={`${box.title} signature`}>
      <h3 className="bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{box.title}</h3>
      <div className="flex flex-1 flex-col gap-1 px-2 py-1 text-xs">
        {box.statement && <p className="text-muted-foreground">{box.statement}</p>}
        <div className="mt-auto flex h-12 items-end border-b border-foreground/60">
          {box.image && (
            <Image src={box.image} alt={`${box.title} signature`} width={240} height={80} unoptimized className="h-11 w-auto max-w-full object-contain" />
          )}
        </div>
        <p className="min-h-4 break-words">
          {box.name ?? <span className="sr-only">Name not recorded</span>}
          {box.capacity && <span className="text-muted-foreground"> ({box.capacity})</span>}
        </p>
        <p>
          <span className="text-muted-foreground">Date: </span>
          {box.date ?? <span className="inline-block w-20 border-b border-foreground/60 align-bottom" aria-label="Date not recorded" />}
        </p>
        {box.note && <p className="font-medium">{box.note}</p>}
      </div>
    </section>
  );
}
