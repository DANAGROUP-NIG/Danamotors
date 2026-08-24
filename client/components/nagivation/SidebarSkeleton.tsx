export default function SidebarSkeleton({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 py-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="mx-auto h-9 w-9 animate-pulse rounded-lg bg-white/10"
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {[4, 4, 4, 1].map((count, gi) => (
        <div key={gi}>
          <div className="mb-1.5 mx-2 h-2 w-12 animate-pulse rounded bg-white/10" />
          <div className="flex flex-col gap-0.5">
            {Array.from({ length: count }).map((_, i) => (
              <div
                key={i}
                className="h-9 animate-pulse rounded-lg bg-white/10"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
