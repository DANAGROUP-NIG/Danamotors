"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useFetchBranches } from "./hooks/useFetchBranches";

export default function BranchSwitcher({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const { branches, activeBranch, setActiveBranch, isLoading, error } =
    useBranchStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Trigger fetch if not yet done
  useFetchBranches(enabled);

  // Close on outside click / Escape
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  function select(branch: (typeof branches)[number]) {
    setActiveBranch(branch);
    setOpen(false);
  }

  const disabled = isLoading || !!error || branches.length === 0;

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2",
          "bg-[#0d2a3d] hover:bg-[#1a3a52] transition-colors",
          "text-sm font-medium text-white",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {isLoading ? (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        ) : (
          <Building2 className="size-4 shrink-0" />
        )}

        <span className="flex-1 truncate text-left">
          {isLoading
            ? "Loading branches…"
            : error
              ? "Failed to load"
              : (activeBranch?.name ?? "Select branch")}
        </span>

        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-white/60 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && branches.length > 0 && (
        <div
          role="listbox"
          aria-label="Select branch"
          className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-[#0d2a3d] shadow-xl overflow-hidden"
          style={{ backgroundColor: "#05141F" }}
        >
          <ul className="max-h-52 overflow-y-auto py-1">
            {branches.map((branch) => {
              const isActive = activeBranch?.id === branch.id;
              return (
                <li key={branch.id} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    onClick={() => select(branch)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2",
                      "text-sm text-white transition-colors",
                      isActive
                        ? "bg-[#0d2a3d] font-semibold"
                        : "hover:bg-[#0d2a3d]/70 font-medium",
                    )}
                  >
                    <Building2 className="size-3.5 shrink-0 opacity-70" />
                    <span className="flex-1 truncate text-left">
                      {branch.name}
                    </span>
                    {branch.location && (
                      <span className="truncate text-[11px] text-white/50">
                        {branch.location}
                      </span>
                    )}
                    {isActive && (
                      <Check className="ml-auto size-3.5 shrink-0 text-white" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
