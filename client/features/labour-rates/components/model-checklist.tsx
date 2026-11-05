"use client";

import { useMemo, useState } from "react";
import { inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import type { RateModelOption } from "../api";

/** Tick models from the model master, with search and select active / none. */
export function ModelChecklist({
  models,
  selected,
  onChange,
  exclude,
}: {
  models: RateModelOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  exclude?: string;
}) {
  const [term, setTerm] = useState("");
  const list = useMemo(
    () =>
      models.filter(
        (m) => m.id !== exclude && (!term || `${m.code} ${m.description}`.toLowerCase().includes(term.toLowerCase())),
      ),
    [models, term, exclude],
  );
  const set = new Set(selected);
  const toggle = (id: string) => onChange(set.has(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input className={cn(inputCls, "h-8 flex-1 py-0")} placeholder="Find a model" value={term} onChange={(e) => setTerm(e.target.value)} />
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => onChange(models.filter((m) => m.active && m.id !== exclude).map((m) => m.id))}>
          All active
        </button>
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => onChange([])}>
          None
        </button>
        <span className="text-muted-foreground">{selected.length} chosen</span>
      </div>
      <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border border-slate-200 p-2 sm:grid-cols-2">
        {list.map((m) => (
          <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
            <input type="checkbox" className="size-4" checked={set.has(m.id)} onChange={() => toggle(m.id)} />
            <span className={cn("truncate", !m.active && "text-slate-400")}>
              {m.description}
              <span className="ml-1 text-xs text-muted-foreground">{m.rates.toLocaleString()} rates{m.active ? "" : " · inactive"}</span>
            </span>
          </label>
        ))}
        {list.length === 0 && <p className="p-2 text-sm text-muted-foreground">No models match.</p>}
      </div>
    </div>
  );
}
