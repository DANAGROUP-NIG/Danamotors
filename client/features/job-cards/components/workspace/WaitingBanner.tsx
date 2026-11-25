import { Hourglass } from "lucide-react";

/** Shown to people who can see the step but do not own it. */
export function WaitingBanner({ message }: { message: string }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
