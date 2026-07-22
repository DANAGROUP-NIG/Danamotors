//icons
import { Search, kbd } from "lucide-react";

export default function HeaderSearch() {
  return (
    <div className="relative mx-auto hidden max-w-sm flex-1 sm:block lg:max-w-md">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        className="h-9 w-full rounded-lg border border-[#e8edf3] bg-[#f8fafc] pl-9 pr-16 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
        placeholder="Search customers, vehicles, job cards…"
        aria-label="Global search"
      />
      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
        ⌘ K
      </kbd>
    </div>
  );
}
