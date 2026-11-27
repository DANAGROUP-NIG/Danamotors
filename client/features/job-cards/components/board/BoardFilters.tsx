"use client";
import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { DateInput } from "@/components/forms/DateInput";
import { inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Branch } from "@/store/branch.store";
import { WorkshopPicker } from "../WorkshopPicker";
import { lagosDate, type BoardFilters as Filters } from "../../lib/board.logic";

const CUSTOM = "custom";

/**
 * Branch, service advisor, technician and received date. Every change goes to the address bar, so a refresh or a
 * shared link keeps the same view.
 */
export function BoardFilters({
  filters,
  branchId,
  branches,
  now,
  onChange,
  onClear,
}: {
  filters: Filters;
  branchId: string | undefined;
  branches: Branch[];
  now: Date;
  onChange: (next: Partial<Filters>) => void;
  onClear: () => void;
}) {
  const today = lagosDate(now);
  const yesterday = lagosDate(new Date(now.getTime() - 86_400_000));
  const preset = !filters.date
    ? ""
    : filters.date === today
      ? today
      : filters.date === yesterday
        ? yesterday
        : CUSTOM;
  const [picking, setPicking] = useState(preset === CUSTOM);
  const received = picking ? CUSTOM : preset;
  const single = branches.length <= 1;
  const applied = [
    filters.advisorId,
    filters.technicianId,
    filters.date,
  ].filter(Boolean).length;
  const filtered = applied > 0;
  // On a phone the filters fold away so the jobs come first; from tablet width they are always shown.
  const [open, setOpen] = useState(false);

  return (
    <div className="grid gap-2">
      <Button
        variant="outline"
        className="h-11 justify-start md:hidden"
        aria-expanded={open}
        aria-controls="board-filters"
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal className="mr-2 size-4" aria-hidden="true" />
        {open
          ? "Hide filters"
          : applied
            ? `Filters, ${applied} applied`
            : "Filters"}
      </Button>
      <div
        id="board-filters"
        className={cn(
          "gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 md:grid xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:items-start",
          open ? "grid" : "hidden",
        )}
      >
        <div className="min-w-0 space-y-1.5">
          <label htmlFor="board-branch" className="text-sm font-medium">
            Branch
          </label>
          <select
            id="board-branch"
            className={inputCls}
            value={branchId ?? ""}
            disabled={single}
            aria-describedby={single ? "board-branch-note" : undefined}
            onChange={(event) =>
              onChange({
                branchId: event.target.value,
                advisorId: undefined,
                technicianId: undefined,
              })
            }
          >
            {branches.length === 0 && <option value="">Your branch</option>}
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {single && (
            <p id="board-branch-note" className="text-xs text-muted-foreground">
              Your account works in one branch.
            </p>
          )}
        </div>
        <WorkshopPicker
          key={`advisor-${branchId}`}
          label="Service advisor"
          endpoint={`/service/staff?role=ServiceAdviser&branchId=${branchId ?? ""}`}
          collection="users"
          value={filters.advisorId ?? ""}
          disabled={!branchId}
          placeholder="All advisors"
          emptyMessage="No service advisors match. Try another name."
          onChange={(id) => onChange({ advisorId: id || undefined })}
        />
        <WorkshopPicker
          key={`technician-${branchId}`}
          label="Technician"
          endpoint={`/service/staff?role=Technician&branchId=${branchId ?? ""}`}
          collection="users"
          value={filters.technicianId ?? ""}
          disabled={!branchId}
          placeholder="All technicians"
          emptyMessage="No technicians match. Try another name."
          onChange={(id) => onChange({ technicianId: id || undefined })}
        />
        <div className="min-w-0 space-y-1.5">
          <label htmlFor="board-received" className="text-sm font-medium">
            Received
          </label>
          <select
            id="board-received"
            className={inputCls}
            value={received}
            onChange={(event) => {
              const value = event.target.value;
              setPicking(value === CUSTOM);
              if (value !== CUSTOM) onChange({ date: value || undefined });
            }}
          >
            <option value="">Any day</option>
            <option value={today}>Today</option>
            <option value={yesterday}>Yesterday</option>
            <option value={CUSTOM}>Pick a date</option>
          </select>
          {received === CUSTOM && (
            <DateInput
              value={preset === CUSTOM ? filters.date : ""}
              max={today}
              onChange={(iso) => {
                if (iso) onChange({ date: iso });
              }}
            />
          )}
        </div>
        <Button
          variant="outline"
          className="h-10 sm:col-span-2 xl:col-span-1 xl:mt-6.5"
          disabled={!filtered}
          title={filtered ? undefined : "No filters to clear"}
          onClick={() => {
            setPicking(false);
            onClear();
          }}
        >
          <X className="mr-2 size-4" aria-hidden="true" />
          Clear filters
        </Button>
      </div>
    </div>
  );
}
