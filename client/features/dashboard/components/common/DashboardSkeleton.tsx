"use client";

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6 animate-pulse">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded bg-slate-200" />
          <div className="h-4 w-32 rounded bg-slate-200" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-36 rounded-xl border border-[#e8edf3] bg-white p-5">
            <div className="space-y-3">
              <div className="h-3 w-20 rounded bg-slate-200" />
              <div className="h-7 w-24 rounded bg-slate-200" />
              <div className="h-10 w-full rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="h-72 rounded-xl border border-[#e8edf3] bg-white p-5">
          <div className="h-4 w-32 rounded bg-slate-200 mb-4" />
          <div className="h-48 rounded bg-slate-100" />
        </div>
        <div className="h-72 rounded-xl border border-[#e8edf3] bg-white p-5">
          <div className="h-4 w-32 rounded bg-slate-200 mb-4" />
          <div className="h-48 rounded bg-slate-100" />
        </div>
        <div className="h-72 rounded-xl border border-[#e8edf3] bg-white p-5">
          <div className="h-4 w-32 rounded bg-slate-200 mb-4" />
          <div className="h-48 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
