"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Users, Car, Wrench, Package, UserCog } from "lucide-react";
import { useGlobalSearch } from "@/features/search/hooks/use-global-search";
import type { SearchResults } from "@/features/search/api/search.api";

const ROUTE_MAP: Record<keyof SearchResults, string> = {
  customers: "/customers",
  vehicles: "/vehicles",
  jobCards: "/job-cards",
  spareParts: "/inventory",
  users: "/users",
};

const LABEL_MAP: Record<keyof SearchResults, string> = {
  customers: "Customers",
  vehicles: "Vehicles",
  jobCards: "Job Cards",
  spareParts: "Spare Parts",
  users: "Users",
};

const ICON_MAP: Record<keyof SearchResults, React.ReactNode> = {
  customers: <Users className="size-3.5" />,
  vehicles: <Car className="size-3.5" />,
  jobCards: <Wrench className="size-3.5" />,
  spareParts: <Package className="size-3.5" />,
  users: <UserCog className="size-3.5" />,
};

export default function HeaderSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { results, isLoading, hasResults, enabled } = useGlobalSearch(query);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  // Cmd+K shortcut to focus
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const handleSelect = useCallback(
    (category: keyof SearchResults, id: string) => {
      router.push(`${ROUTE_MAP[category]}/${id}`);
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    },
    [router],
  );

  const categories = Object.keys(results) as (keyof SearchResults)[];

  return (
    <div ref={containerRef} className="relative mx-auto hidden max-w-sm flex-1 sm:block lg:max-w-md">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (query.trim().length >= 2) setOpen(true);
        }}
        placeholder="Search customers, vehicles, job cards…"
        aria-label="Global search"
        className="h-9 w-full rounded-lg border border-[#e8edf3] bg-[#f8fafc] pl-9 pr-16 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
        ⌘ K
      </kbd>

      {/* Results dropdown */}
      {open && enabled && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Searching…
              </div>
            ) : hasResults ? (
              categories.map((category) => {
                const items = results[category];
                if (items.length === 0) return null;
                return (
                  <div key={category}>
                    <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                      <span className="text-slate-400">{ICON_MAP[category]}</span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {LABEL_MAP[category]}
                      </span>
                    </div>
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(category, item.id)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {"name" in item ? item.name : item.label}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {"email" in item ? item.email : item.sublabel}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })
            ) : (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                No results found for &ldquo;{query}&rdquo;
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
