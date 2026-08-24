"use client";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";

//icons
import { Building2, ChevronDown } from "lucide-react";

export default function BranchDropdown({
  branches,
  activeBranch,
  isLoading,
  canSwitch,
  canSeeAll,
  onSelect,
  onAllSelect,
}: {
  branches: { id: string; name: string }[];
  activeBranch: { id: string; name: string } | null;
  isLoading: boolean;
  canSwitch: boolean;
  canSeeAll: boolean;
  onSelect: (branch: { id: string; name: string }) => void;
  onAllSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const isAll = canSeeAll && activeBranch === null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => canSwitch && setOpen((v) => !v)}
        disabled={!canSwitch || isLoading}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5",
          "transition-all duration-150",
          canSwitch
            ? "bg-white/10 hover:bg-white/15 cursor-pointer"
            : "bg-white/5 cursor-default",
        )}
      >
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10">
          <Building2 className="size-3.5 text-white/60" />
        </span>
        <div className="min-w-0 flex-1 text-left">
          {isLoading ? (
            <div className="h-3.5 w-20 animate-pulse rounded bg-white/10" />
          ) : (
            <>
              <p className="truncate text-[11px] font-medium uppercase tracking-wider text-white/40">
                Branch
              </p>
              <p className="truncate text-sm font-semibold text-white">
                {isAll
                  ? "All Branches"
                  : (activeBranch?.name ?? branches[0]?.name ?? "No branch")}
              </p>
            </>
          )}
        </div>
        {canSwitch && (
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-white/40 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        )}
      </button>

      {open && canSwitch && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0c1e2e] shadow-2xl shadow-black/40">
          {canSeeAll && (
            <button
              type="button"
              onClick={() => {
                onAllSelect();
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors",
                isAll
                  ? "bg-white/10 text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white",
              )}
            >
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-white/10 text-[11px] font-bold text-white/60">
                All
              </span>
              <span className="text-sm font-medium">All Branches</span>
              {isAll && (
                <span className="ml-auto size-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          )}
          {canSeeAll && branches.length > 0 && (
            <div className="mx-3 border-t border-white/5" />
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {branches.map((b) => {
              const isActive = activeBranch?.id === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    onSelect(b);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors",
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <span className="inline-flex size-7 items-center justify-center rounded-md bg-white/10 text-[10px] font-bold text-white/60">
                    {b.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate text-sm font-medium">{b.name}</span>
                  {isActive && (
                    <span className="ml-auto size-1.5 rounded-full bg-emerald-400" />
                  )}
                </button>
              );
            })}
          </div>
          {branches.length === 0 && !isLoading && (
            <p className="px-4 py-3 text-center text-xs text-white/40">
              No branches available
            </p>
          )}
        </div>
      )}
    </div>
  );
}
