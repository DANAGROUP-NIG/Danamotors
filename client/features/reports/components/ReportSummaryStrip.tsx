import { cn } from "@/lib/utils";
import type { SummaryCard } from "../types";

const DOT: Record<NonNullable<SummaryCard["tone"]>, string> = {
  gray: "bg-slate-400",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
  orange: "bg-orange-500",
};

export function ReportSummaryStrip({ cards }: { cards: SummaryCard[] }) {
  if (!cards.length) return null;
  return (
    <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))] print:hidden">
      {cards.map((card) => (
        <div key={card.label} className={cn("min-w-0 rounded-xl border border-[#e8edf3] bg-white p-4 shadow-sm", card.muted && "opacity-60")}>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500" title={card.label}>
            {card.tone && <span className={cn("size-2 shrink-0 rounded-full", DOT[card.tone])} aria-hidden />}
            <span className="truncate">{card.label}</span>
          </p>
          <p className={cn("mt-1 break-words font-bold tabular-nums text-slate-900", String(card.value).length > 10 ? "text-xl" : "text-2xl")}>{card.value}</p>
          {card.sub && <p className="mt-0.5 truncate text-sm text-muted-foreground">{card.sub}</p>}
        </div>
      ))}
    </section>
  );
}
